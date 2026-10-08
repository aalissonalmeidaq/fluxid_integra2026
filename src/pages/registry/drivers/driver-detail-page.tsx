import React, { useEffect, useRef, useState } from 'react';
import type { RegistryFailure, RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { DriverDetail, LinkableUserView } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Button, Card, ErrorState, Loading, Select } from '@/design-system';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';
import { DetailBlock, secondaryLinkClass } from '../components/detail-list';
import { AnonymizeAction } from '../components/anonymize-action';
import { LifecycleActions } from '../components/lifecycle-actions';
import { RegistryHistory } from '../components/registry-history';
import { RevealDocument } from '../components/reveal-document';
import { AnonymizedBadge, EntityStatusBadge, ValidityBadge } from '../components/status-badge';
import { useRegistryService } from '../use-registry-service';

export interface DriverAbilities { write: boolean; deactivate: boolean; document: boolean; history: boolean; anonymize: boolean }

export interface DriverDetailViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  driverId: string;
  can: DriverAbilities;
}

type Load = 'loading' | 'ready' | 'not_found' | 'error';

const formatDate = (iso: string | null): string => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const formatCpf = (value: string): string => (value.length === 11 ? `${value.slice(0, 3)}.${value.slice(3, 6)}.${value.slice(6, 9)}-${value.slice(9)}` : value);

function failureMessage(failure: RegistryFailure): string {
  switch (failure.kind) {
    case 'access_denied':
    case 'mfa_required': return 'Você não tem permissão para esta ação.';
    case 'offline': return 'Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.';
    case 'user_not_eligible': return 'Este usuário não pode ser vinculado a este motorista. Escolha outro.';
    case 'inactive_record': return 'Este motorista está inativo e não aceita novo vínculo.';
    case 'anonymized_record': return 'Os dados pessoais deste motorista foram anonimizados.';
    case 'justification_required': return 'Explique o motivo com pelo menos 5 caracteres.';
    case 'not_found': return 'Motorista não encontrado.';
    default: return 'Não foi possível confirmar se a ação foi concluída. Recarregue a tela antes de tentar de novo.';
  }
}

export function DriverDetailView({ organizationId, service, online, driverId, can }: DriverDetailViewProps): React.JSX.Element {
  const [detail, setDetail] = useState<DriverDetail | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [users, setUsers] = useState<LinkableUserView[]>([]);
  const [chosenUser, setChosenUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlinkTrigger, setUnlinkTrigger] = useState<HTMLElement | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ variant: 'sucesso' | 'erro'; message: string } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const apply = (outcome: RegistryOutcome<DriverDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    apply(await service.getDriver(organizationId, driverId));
  };
  const refresh = async (): Promise<void> => {
    if (!service) return;
    const fresh = await service.getDriver(organizationId, driverId);
    if (fresh.kind === 'success') { setDetail(fresh.value); setHistoryTick((tick) => tick + 1); }
  };
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.getDriver(organizationId, driverId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, driverId]);
  const canLink = can.write && detail !== null && detail.driver.status === 'active' && detail.driver.anonymizedAt === null && detail.linkedUser === null;
  useEffect(() => {
    if (!service || !canLink) return undefined;
    let active = true;
    void service.listLinkableUsers(organizationId).then((outcome) => { if (active && outcome.kind === 'success') setUsers(outcome.value); });
    return () => { active = false; };
  }, [service, organizationId, canLink]);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const link = async (): Promise<void> => {
    if (!service || chosenUser === '' || busy) return;
    setBusy(true);
    setNotice(null);
    const outcome = await service.linkDriverUser(organizationId, driverId, chosenUser);
    setBusy(false);
    if (outcome.kind === 'success') { setChosenUser(''); setNotice({ variant: 'sucesso', message: 'Usuário vinculado ao motorista.' }); await refresh(); }
    else setNotice({ variant: 'erro', message: failureMessage(outcome) });
  };
  const unlink = async (justification: string): Promise<void> => {
    if (!service || busy) return;
    setBusy(true);
    setDialogError(null);
    const outcome = await service.unlinkDriverUser(organizationId, driverId, justification);
    setBusy(false);
    if (outcome.kind === 'success') { setUnlinkTrigger(null); setNotice({ variant: 'sucesso', message: 'Usuário desvinculado do motorista.' }); await refresh(); }
    else setDialogError(failureMessage(outcome));
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Motorista não encontrado" message="Ele não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar o motorista" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (load === 'loading' || !detail) return <Loading variant="pagina" busy label="Carregando o motorista…" />;

  const { driver, linkedUser } = detail;
  const anonymized = driver.anonymizedAt !== null;
  const active = driver.status === 'active';

  return (
    <section aria-labelledby="driver-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="min-w-0">
          <p className="text-legenda font-semibold uppercase text-azul-profundo"><a className="underline" href="/motoristas">Motoristas</a></p>
          <h2 id="driver-title" className="mt-1 break-words text-h2 font-bold text-navy">{driver.fullName}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <EntityStatusBadge status={driver.status} />
            {anonymized ? <AnonymizedBadge /> : <ValidityBadge status={driver.cnhStatus} subject="CNH" />}
          </p>
        </div>
        {can.write && active && !anonymized && <a className={`${secondaryLinkClass} tablet:shrink-0`} href={`/motoristas/${driver.id}/editar`}>Editar motorista</a>}
      </div>

      {anonymized && (
        <p role="note" className="rounded-card border border-borda-suave bg-info-fundo p-4 text-corpo">
          Dados pessoais anonimizados em {formatDate(driver.anonymizedAt)}. Este cadastro não aceita mais edição.
        </p>
      )}
      {notice && <Alert ref={noticeRef} tabIndex={-1} variant={notice.variant}>{notice.message}</Alert>}

      <LifecycleActions
        name={driver.fullName}
        active={active}
        blocked={anonymized}
        canDeactivate={can.deactivate}
        online={online}
        labels={{
          inactivate: 'Inativar motorista', reactivate: 'Reativar motorista', inactivated: 'Motorista inativado. O vínculo com o usuário continua.', reactivated: 'Motorista reativado.',
          inactivateTitle: 'Inativar motorista', reactivateTitle: 'Reativar motorista',
          inactivateDescription: 'O motorista sai de uso e não aceita mais edição nem novo vínculo; o vínculo atual com o usuário continua. Nada é apagado. Explique o motivo: a ação fica no histórico e na auditoria.',
          reactivateDescription: 'O motorista volta a ficar ativo. Explique o motivo: a ação fica no histórico e na auditoria.',
        }}
        inactivate={(justification) => service.inactivateDriver(organizationId, driver.id, justification)}
        reactivate={(justification) => service.reactivateDriver(organizationId, driver.id, justification)}
        onChanged={(message) => { setNotice({ variant: 'sucesso', message }); void refresh(); }}
      />

      {can.anonymize && !anonymized && (
        <AnonymizeAction
          subject="driver"
          name={driver.fullName}
          blockedReason={active ? 'Inative o motorista antes de anonimizar.' : null}
          online={online}
          anonymize={(request) => service.anonymizeDriver(organizationId, driver.id, driver.version, request)}
          onDone={(result) => { setNotice({ variant: 'sucesso', message: `Dados pessoais anonimizados em ${formatDate(result.anonymizedAt)}.` }); void refresh(); }}
        />
      )}

      <DetailBlock
        title="Dados do motorista"
        titleId="driver-data-title"
        rows={[
          {
            label: 'CPF',
            value: anonymized ? null : (
              <RevealDocument label="CPF" masked={driver.cpfDisplay} canReveal={can.document} format={formatCpf} disabled={!online}
                reveal={() => service.revealDocument(organizationId, 'driver', driver.id, 'cpf')} />
            ),
          },
          {
            label: 'CNH',
            value: anonymized ? null : (
              <RevealDocument label="CNH" masked={driver.cnhDisplay} canReveal={can.document} disabled={!online}
                reveal={() => service.revealDocument(organizationId, 'driver', driver.id, 'cnh')} />
            ),
          },
          { label: 'Categoria da CNH', value: anonymized ? null : driver.cnhCategory },
          { label: 'Validade da CNH', value: anonymized ? null : formatDate(driver.cnhValidUntil) },
          { label: 'Telefone', value: driver.phone },
        ]}
      />

      <Card>
        <section aria-labelledby="driver-user-title" className="flex flex-col gap-4">
          <h3 id="driver-user-title" className="text-h3 font-semibold text-navy">Usuário do aplicativo</h3>
          {linkedUser ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-corpo"><span className="font-semibold">{linkedUser.displayName}</span>{linkedUser.active ? '' : ' (usuário inativo)'}</p>
              {can.write && !anonymized && <Button variant="secundario" disabled={!online || busy} onClick={(event) => { setDialogError(null); setUnlinkTrigger(event.currentTarget); }}>Desvincular usuário</Button>}
            </div>
          ) : (
            <>
              <p className="text-corpo text-texto-secundario">{anonymized ? 'Sem usuário vinculado.' : 'Nenhum usuário vinculado a este motorista.'}</p>
              {canLink && (
                <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
                  <Select wrapperClassName="tablet:flex-1" label="Usuário vinculável" name="linkUser" value={chosenUser} onChange={(event) => setChosenUser(event.target.value)}>
                    <option value="">{users.length === 0 ? 'Nenhum usuário vinculável' : 'Escolha um usuário'}</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                  </Select>
                  <Button className="tablet:mb-6" disabled={!online || chosenUser === ''} loading={busy} loadingLabel="Vinculando…" onClick={() => void link()}>Vincular usuário</Button>
                </div>
              )}
            </>
          )}
        </section>
      </Card>

      {unlinkTrigger && (
        <ReasonDialog
          title="Desvincular usuário"
          confirmLabel="Confirmar desvinculação"
          description="O usuário deixa de estar ligado a este motorista e pode ser vinculado a outro. A ação fica no histórico e na auditoria."
          busy={busy}
          error={dialogError}
          returnFocusTo={unlinkTrigger}
          onCancel={() => setUnlinkTrigger(null)}
          onConfirm={(justification) => void unlink(justification)}
        />
      )}

      {can.history && <RegistryHistory organizationId={organizationId} service={service} entityType="driver" entityId={driver.id} refreshKey={driver.version * 1000 + historyTick} />}
    </section>
  );
}

export function DriverDetailPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const { permissions } = usePermissions();
  const route = resolveRegistryRoute(window.location.pathname);
  const driverId = route?.area === 'drivers' && (route.kind === 'detail' || route.kind === 'edit') ? route.id : '';
  const has = (code: string): boolean => permissions?.tenant.includes(code) ?? false;
  return (
    <AccessGate permission="driver.read">
      <DriverDetailView key={`${organizationId}:${driverId}`} organizationId={organizationId} service={service} online={online} driverId={driverId}
        can={{ write: has('driver.write'), deactivate: has('driver.deactivate'), document: has('driver.document'), history: has('driver.history'), anonymize: has('driver.anonymize') }} />
    </AccessGate>
  );
}
