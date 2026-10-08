import React, { useEffect, useRef, useState } from 'react';
import type { RegistryFailure, RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { VehicleView } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Button, ErrorState, Loading } from '@/design-system';
import { formatPlate } from '@/domain/registry/plate';
import { VEHICLE_TYPE_LABELS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';
import { DetailBlock, secondaryLinkClass } from '../components/detail-list';
import { RegistryHistory } from '../components/registry-history';
import { ValidityBadge, VehicleStatusBadge } from '../components/status-badge';
import { useRegistryService } from '../use-registry-service';

export interface VehicleAbilities { write: boolean; deactivate: boolean; history: boolean }

export interface VehicleDetailViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  vehicleId: string;
  can: VehicleAbilities;
}

type Load = 'loading' | 'ready' | 'not_found' | 'error';
type Target = 'available' | 'maintenance' | 'inactive';
type Dialog = { target: Target; trigger: HTMLElement } | null;

const formatDate = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : '');

function failureMessage(failure: RegistryFailure): string {
  switch (failure.kind) {
    case 'access_denied':
    case 'mfa_required': return 'Você não tem permissão para esta ação.';
    case 'offline': return 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.';
    case 'version_conflict': return 'Este veículo foi alterado por outra pessoa. Recarregue a tela antes de tentar de novo.';
    case 'justification_required': return 'Explique o motivo com pelo menos 5 caracteres.';
    case 'already_inactive': return 'Este veículo já estava inativo. Recarregue a tela.';
    case 'invalid': return 'A mudança de situação não é permitida a partir da situação atual.';
    case 'not_found': return 'Veículo não encontrado.';
    default: return 'Não foi possível confirmar se a ação foi concluída. Recarregue a tela antes de tentar de novo.';
  }
}

const TARGET_LABELS: Record<Target, { action: string; title: string; done: string }> = {
  available: { action: 'Marcar como disponível', title: 'Marcar veículo como disponível', done: 'Veículo marcado como disponível.' },
  maintenance: { action: 'Colocar em manutenção', title: 'Colocar veículo em manutenção', done: 'Veículo colocado em manutenção.' },
  inactive: { action: 'Inativar veículo', title: 'Inativar veículo', done: 'Veículo inativado.' },
};

export function VehicleDetailView({ organizationId, service, online, vehicleId, can }: VehicleDetailViewProps): React.JSX.Element {
  const [vehicle, setVehicle] = useState<VehicleView | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ variant: 'sucesso' | 'erro'; message: string } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const apply = (outcome: RegistryOutcome<VehicleView>): void => {
    if (outcome.kind === 'success') { setVehicle(outcome.value); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    apply(await service.getVehicle(organizationId, vehicleId));
  };
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.getVehicle(organizationId, vehicleId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, vehicleId]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const changeStatus = async (target: Target, justification: string | null): Promise<boolean> => {
    if (!service || !vehicle) return false;
    setBusy(true);
    const outcome = await service.changeVehicleStatus(organizationId, vehicle.id, vehicle.version, target, justification);
    setBusy(false);
    if (outcome.kind === 'success') {
      setNotice({ variant: 'sucesso', message: TARGET_LABELS[target].done });
      const fresh = await service.getVehicle(organizationId, vehicle.id);
      if (fresh.kind === 'success') setVehicle(fresh.value);
      return true;
    }
    const message = failureMessage(outcome);
    if (dialog) setDialogError(message); else setNotice({ variant: 'erro', message });
    return false;
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Veículo não encontrado" message="Ele não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar o veículo" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (load === 'loading' || !vehicle) return <Loading variant="pagina" busy label="Carregando o veículo…" />;

  const inactive = vehicle.status === 'inactive';
  const type = vehicle.vehicleTypeDetail ? `${VEHICLE_TYPE_LABELS[vehicle.vehicleType]}: ${vehicle.vehicleTypeDetail}` : VEHICLE_TYPE_LABELS[vehicle.vehicleType];
  const actions: Target[] = vehicle.status === 'available' ? ['maintenance', 'inactive'] : vehicle.status === 'maintenance' ? ['available', 'inactive'] : ['available'];

  const act = (target: Target, trigger: HTMLElement): void => {
    setNotice(null);
    setDialogError(null);
    // Sem justificativa para disponível <-> manutenção; ir para ou sair de inativo abre o diálogo (RF-021).
    if (target === 'inactive' || inactive) setDialog({ target, trigger });
    else void changeStatus(target, null);
  };

  return (
    <section aria-labelledby="vehicle-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="min-w-0">
          <p className="text-legenda font-semibold uppercase text-azul-profundo"><a className="underline" href="/veiculos">Veículos</a></p>
          <h2 id="vehicle-title" className="mt-1 break-words text-h2 font-bold text-navy">Veículo {formatPlate(vehicle.plate)}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <VehicleStatusBadge status={vehicle.status} />
            <ValidityBadge status={vehicle.licensingStatus} subject="Licenciamento" />
          </p>
        </div>
        {can.write && !inactive && <a className={`${secondaryLinkClass} tablet:shrink-0`} href={`/veiculos/${vehicle.id}/editar`}>Editar veículo</a>}
      </div>

      {notice && <Alert ref={noticeRef} tabIndex={-1} variant={notice.variant}>{notice.message}</Alert>}

      <DetailBlock
        title="Dados do veículo"
        titleId="vehicle-data-title"
        rows={[
          { label: 'Tipo', value: type },
          { label: 'Marca', value: vehicle.brand },
          { label: 'Modelo', value: vehicle.model },
          { label: 'Ano de fabricação', value: vehicle.manufactureYear === null ? null : String(vehicle.manufactureYear) },
          { label: 'Capacidade', value: `${vehicle.capacityCylinders} ${vehicle.capacityCylinders === 1 ? 'cilindro' : 'cilindros'}` },
          { label: 'Carga máxima', value: vehicle.maxLoadKg === null ? null : `${vehicle.maxLoadKg.toLocaleString('pt-BR')} kg` },
          { label: 'Vencimento do licenciamento', value: formatDate(vehicle.licensingDueOn) },
        ]}
      />

      {can.deactivate && (
        <section aria-labelledby="vehicle-actions-title" className="flex flex-col gap-4">
          <h3 id="vehicle-actions-title" className="text-h3 font-semibold text-navy">Situação operacional</h3>
          <div className="flex flex-wrap gap-2">
            {actions.map((target) => (
              <Button key={target} variant={target === 'inactive' ? 'secundario' : 'primario'} disabled={!online || busy} onClick={(event) => act(target, event.currentTarget)}>
                {inactive && target === 'available' ? 'Reativar veículo' : TARGET_LABELS[target].action}
              </Button>
            ))}
          </div>
          {!online && <p className="text-legenda text-texto-secundario">Sem conexão. Esta operação exige conexão.</p>}
        </section>
      )}

      {dialog && (
        <ReasonDialog
          title={inactive ? 'Reativar veículo' : TARGET_LABELS[dialog.target].title}
          confirmLabel={inactive ? 'Confirmar reativação' : 'Confirmar inativação'}
          description={inactive ? 'O veículo volta a ficar disponível. Explique o motivo: a ação fica no histórico e na auditoria.' : 'O veículo sai de uso e não pode mais ser editado. Explique o motivo: a ação fica no histórico e na auditoria.'}
          busy={busy}
          error={dialogError}
          returnFocusTo={dialog.trigger}
          onCancel={() => setDialog(null)}
          onConfirm={(justification) => { void changeStatus(dialog.target, justification).then((done) => { if (done) setDialog(null); }); }}
        />
      )}

      {can.history && <RegistryHistory organizationId={organizationId} service={service} entityType="vehicle" entityId={vehicle.id} refreshKey={vehicle.version} />}
    </section>
  );
}

export function VehicleDetailPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const { permissions } = usePermissions();
  const route = resolveRegistryRoute(window.location.pathname);
  const vehicleId = route?.area === 'vehicles' && (route.kind === 'detail' || route.kind === 'edit') ? route.id : '';
  const has = (code: string): boolean => permissions?.tenant.includes(code) ?? false;
  return (
    <AccessGate permission="vehicle.read">
      <VehicleDetailView key={`${organizationId}:${vehicleId}`} organizationId={organizationId} service={service} online={online} vehicleId={vehicleId}
        can={{ write: has('vehicle.write'), deactivate: has('vehicle.deactivate'), history: has('vehicle.history') }} />
    </AccessGate>
  );
}
