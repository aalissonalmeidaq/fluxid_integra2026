import React, { useEffect, useRef, useState } from 'react';
import type { RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { GeofenceView } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { Alert, Card, ErrorState, Loading } from '@/design-system';
import { GEOFENCE_SHAPE_LABELS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { DetailBlock, secondaryLinkClass } from '../components/detail-list';
import { LifecycleActions } from '../components/lifecycle-actions';
import { RegistryHistory } from '../components/registry-history';
import { GeofencePreview } from '../components/geofence-preview';
import { PointTester } from '../components/point-tester';
import { EntityStatusBadge } from '../components/status-badge';
import { useRegistryService } from '../use-registry-service';

export interface GeofenceAbilities { write: boolean; deactivate: boolean; history: boolean }

export interface GeofenceDetailViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  geofenceId: string;
  can: GeofenceAbilities;
}

type Load = 'loading' | 'ready' | 'not_found' | 'error';

export function GeofenceDetailView({ organizationId, service, online, geofenceId, can }: GeofenceDetailViewProps): React.JSX.Element {
  const [geofence, setGeofence] = useState<GeofenceView | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const apply = (outcome: RegistryOutcome<GeofenceView>): void => {
    if (outcome.kind === 'success') { setGeofence(outcome.value); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    apply(await service.getGeofence(organizationId, geofenceId));
  };
  const refresh = async (): Promise<void> => {
    if (!service) return;
    const fresh = await service.getGeofence(organizationId, geofenceId);
    if (fresh.kind === 'success') setGeofence(fresh.value);
  };
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.getGeofence(organizationId, geofenceId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, geofenceId]);

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Geocerca não encontrada" message="Ela não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar a geocerca" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (load === 'loading' || !geofence) return <Loading variant="pagina" busy label="Carregando a geocerca…" />;

  const active = geofence.status === 'active';
  const shapeRows = geofence.shape === 'circle'
    ? [
      { label: 'Centro', value: geofence.center ? `${geofence.center.lat}, ${geofence.center.lng}` : '' },
      { label: 'Raio', value: geofence.radiusM === null ? '' : `${geofence.radiusM} metros` },
    ]
    : [{ label: 'Vértices', value: `${geofence.vertices.length}` }];

  return (
    <section aria-labelledby="geofence-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="min-w-0">
          <p className="text-legenda font-semibold uppercase text-azul-profundo"><a className="underline" href="/geocercas">Geocercas</a></p>
          <h2 id="geofence-title" className="mt-1 break-words text-h2 font-bold text-navy">{geofence.name}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <EntityStatusBadge status={geofence.status} />
            <span className="text-corpo text-texto-secundario">{GEOFENCE_SHAPE_LABELS[geofence.shape]}</span>
          </p>
        </div>
        {can.write && active && <a className={`${secondaryLinkClass} tablet:shrink-0`} href={`/geocercas/${geofence.id}/editar`}>Editar geocerca</a>}
      </div>

      {notice && <Alert ref={noticeRef} tabIndex={-1} variant="sucesso">{notice}</Alert>}
      <LifecycleActions
        name={geofence.name}
        active={active}
        canDeactivate={can.deactivate}
        online={online}
        labels={{
          inactivate: 'Inativar geocerca', reactivate: 'Reativar geocerca', inactivated: 'Geocerca inativada.', reactivated: 'Geocerca reativada.',
          inactivateTitle: 'Inativar geocerca', reactivateTitle: 'Reativar geocerca',
          inactivateDescription: 'A geocerca deixa de valer e não aceita mais edição nem teste de ponto. Nada é apagado. Explique o motivo: a ação fica no histórico e na auditoria.',
          reactivateDescription: 'A geocerca volta a valer, se a unidade está ativa. Explique o motivo: a ação fica no histórico e na auditoria.',
        }}
        inactivate={(justification) => service.inactivateGeofence(organizationId, geofence.id, justification)}
        reactivate={(justification) => service.reactivateGeofence(organizationId, geofence.id, justification)}
        onChanged={(message) => { setNotice(message); void refresh(); }}
      />

      <DetailBlock
        title="Dados da geocerca"
        titleId="geofence-data-title"
        rows={[
          { label: 'Unidade', value: <a className="font-semibold text-azul-profundo underline" href={`/clientes/${geofence.customerId}/unidades/${geofence.siteId}`}>{geofence.siteName}</a> },
          { label: 'Cliente', value: <a className="font-semibold text-azul-profundo underline" href={`/clientes/${geofence.customerId}`}>{geofence.customerName}</a> },
          ...shapeRows,
          { label: 'Área aproximada', value: geofence.areaM2 === null ? '' : `${geofence.areaM2.toLocaleString('pt-BR')} m²` },
        ]}
      />

      <Card>
        <section aria-labelledby="geofence-preview-title" className="flex flex-col gap-4">
          <h3 id="geofence-preview-title" className="text-h3 font-semibold text-navy">Forma</h3>
          <GeofencePreview value={geofence.shape === 'circle' ? { shape: 'circle', center: geofence.center, radiusM: geofence.radiusM } : { shape: 'polygon', vertices: geofence.vertices }} />
        </section>
      </Card>

      <Card>
        <section aria-labelledby="geofence-test-title" className="flex flex-col gap-4">
          <h3 id="geofence-test-title" className="text-h3 font-semibold text-navy">Testar um ponto</h3>
          {active ? (
            <>
              <p className="text-corpo">Informe uma latitude e uma longitude para saber se o ponto está dentro da geocerca. O servidor decide, e nada é gravado.</p>
              <PointTester disabled={!online} test={(latitude, longitude) => service.pointInGeofence(organizationId, geofence.id, latitude, longitude)} />
            </>
          ) : <p className="text-corpo text-texto-secundario">Geocerca inativa: o teste de ponto fica disponível só para geocercas ativas.</p>}
        </section>
      </Card>

      {can.history && <RegistryHistory organizationId={organizationId} service={service} entityType="geofence" entityId={geofence.id} refreshKey={geofence.version} />}
    </section>
  );
}

export function GeofenceDetailPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const { permissions } = usePermissions();
  const route = resolveRegistryRoute(window.location.pathname);
  const geofenceId = route?.area === 'geofences' && (route.kind === 'detail' || route.kind === 'edit') ? route.id : '';
  const has = (code: string): boolean => permissions?.tenant.includes(code) ?? false;
  return (
    <AccessGate permission="geofence.read">
      <GeofenceDetailView key={`${organizationId}:${geofenceId}`} organizationId={organizationId} service={service} online={online} geofenceId={geofenceId}
        can={{ write: has('geofence.write'), deactivate: has('geofence.deactivate'), history: has('geofence.history') }} />
    </AccessGate>
  );
}
