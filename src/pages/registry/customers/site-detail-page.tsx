import React, { useEffect, useRef, useState } from 'react';
import type { RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { SiteDetail } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { resolveRegistryRoute } from '@/app/registry/registry-routes';
import { OsmMap } from '@/components/maps/osm-map';
import { Alert, Card, ErrorState, Loading } from '@/design-system';
import { GEOFENCE_SHAPE_LABELS, WEEK_DAY_LABELS } from '@/domain/registry/registry-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { DetailBlock, secondaryLinkClass } from '../components/detail-list';
import { LifecycleActions } from '../components/lifecycle-actions';
import { RegistryHistory } from '../components/registry-history';
import { primaryLinkClass } from '../components/registry-list';
import { AnonymizedBadge, EntityStatusBadge } from '../components/status-badge';
import { useRegistryService } from '../use-registry-service';

export interface SiteAbilities { write: boolean; deactivate: boolean; history: boolean; geofenceWrite: boolean }

export interface SiteDetailViewProps {
  organizationId: string;
  service: RegistryService | null;
  online: boolean;
  customerId: string;
  siteId: string;
  can: SiteAbilities;
}

type Load = 'loading' | 'ready' | 'not_found' | 'error';

const time = (value: string | null): string => (value ? value.slice(0, 5) : '');

export function SiteDetailView({ organizationId, service, online, customerId, siteId, can }: SiteDetailViewProps): React.JSX.Element {
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);

  const apply = (outcome: RegistryOutcome<SiteDetail>): void => {
    if (outcome.kind === 'success') { setDetail(outcome.value); setLoad('ready'); }
    else setLoad(outcome.kind === 'not_found' ? 'not_found' : 'error');
  };
  const reload = async (): Promise<void> => {
    if (!service) return;
    setLoad('loading');
    apply(await service.getSite(organizationId, siteId));
  };
  const refresh = async (): Promise<void> => {
    if (!service) return;
    const fresh = await service.getSite(organizationId, siteId);
    if (fresh.kind === 'success') setDetail(fresh.value);
  };
  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.getSite(organizationId, siteId).then((outcome) => { if (active) apply(outcome); });
    return () => { active = false; };
  }, [service, organizationId, siteId]);

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;
  if (load === 'not_found') return <ErrorState variant="sem-permissao" title="Unidade não encontrada" message="Ela não existe nesta organização." />;
  if (load === 'error') return <ErrorState title="Não foi possível carregar a unidade" message="Tente novamente em instantes." onRetry={() => void reload()} />;
  if (load === 'loading' || !detail) return <Loading variant="pagina" busy label="Carregando a unidade…" />;

  const { site, geofences } = detail;
  const anonymized = site.anonymizedAt !== null;
  const canEdit = can.write && site.status === 'active' && !anonymized;
  const address = [`${site.street}, ${site.number}`, site.complement, site.district, `${site.city}/${site.state}`, `CEP ${site.postalCode.replace(/^(\d{5})(\d{3})$/, '$1-$2')}`].filter(Boolean).join(' · ');
  const days = site.receivingDays.map((day) => WEEK_DAY_LABELS[day]).filter(Boolean).join(', ');
  const confirmedOn = site.coordinatesConfirmedAt ? new Date(site.coordinatesConfirmedAt).toLocaleDateString('pt-BR') : '';
  const coordinatesOrigin = site.latitude === null ? null
    : site.coordinatesSource === 'geocoded'
      ? (confirmedOn ? `Buscadas pelo endereço e confirmadas em ${confirmedOn}` : 'Buscadas pelo endereço, sem confirmação (o endereço mudou depois)')
      : 'Informadas à mão';
  const window = site.receivingFrom && site.receivingTo ? `${days || 'Dias não informados'}, das ${time(site.receivingFrom)} às ${time(site.receivingTo)}` : days;

  return (
    <section aria-labelledby="site-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:items-start tablet:justify-between">
        <div className="min-w-0">
          <p className="text-legenda font-semibold uppercase text-azul-profundo">
            <a className="underline" href="/clientes">Clientes</a> / <a className="underline" href={`/clientes/${customerId}`}>{site.customerName}</a>
          </p>
          <h2 id="site-title" className="mt-1 break-words text-h2 font-bold text-navy">{site.name}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-2"><EntityStatusBadge status={site.status} />{anonymized && <AnonymizedBadge />}</p>
        </div>
        {canEdit && <a className={`${secondaryLinkClass} tablet:shrink-0`} href={`/clientes/${customerId}/unidades/${site.id}/editar`}>Editar unidade</a>}
      </div>

      {notice && <Alert ref={noticeRef} tabIndex={-1} variant="sucesso">{notice}</Alert>}
      <LifecycleActions
        name={site.name}
        active={site.status === 'active'}
        blocked={anonymized}
        canDeactivate={can.deactivate}
        online={online}
        labels={{
          inactivate: 'Inativar unidade', reactivate: 'Reativar unidade', inactivated: 'Unidade inativada.', reactivated: 'Unidade reativada. As geocercas inativadas junto continuam inativas: reative cada uma à mão.',
          inactivateTitle: 'Inativar unidade', reactivateTitle: 'Reativar unidade', inactivateDescription: '', reactivateDescription: 'Só a unidade volta a ficar ativa, e só se o cliente está ativo; as geocercas inativadas junto continuam inativas. Explique o motivo: a ação fica no histórico e na auditoria.',
        }}
        cascade={{ scope: 'site', preview: () => service.previewSiteInactivation(organizationId, site.id) }}
        inactivate={(justification, counts) => service.inactivateSite(organizationId, site.id, justification, counts)}
        reactivate={(justification) => service.reactivateSite(organizationId, site.id, justification)}
        onChanged={(message) => { setNotice(message); void refresh(); }}
      />

      <DetailBlock
        title="Endereço"
        titleId="site-address-title"
        rows={[
          { label: 'Endereço', value: address },
          { label: 'Código do município (IBGE)', value: site.ibgeCode },
          { label: 'Latitude', value: site.latitude === null ? null : String(site.latitude) },
          { label: 'Longitude', value: site.longitude === null ? null : String(site.longitude) },
          { label: 'Origem das coordenadas', value: coordinatesOrigin },
          { label: 'Primeira entrega', value: site.latitude === null ? null : site.firstDeliveryConfirmed ? 'Endereço confirmado pelo motorista' : 'Ainda sem confirmação do motorista' },
        ]}
      />
      {site.latitude !== null && site.longitude !== null && (
        <Card>
          <section aria-labelledby="site-map-title" className="flex flex-col gap-4">
            <h3 id="site-map-title" className="text-h3 font-semibold text-navy">Mapa</h3>
            <OsmMap title={`Mapa da unidade ${site.name}`} latitude={site.latitude} longitude={site.longitude} />
          </section>
        </Card>
      )}
      <DetailBlock
        title="Recebimento"
        titleId="site-receiving-title"
        rows={[
          { label: 'Responsável', value: site.receivingContactName },
          { label: 'Telefone do responsável', value: site.receivingContactPhone },
          { label: 'Dias e horários', value: window },
          { label: 'Instruções de acesso', value: site.accessInstructions },
        ]}
      />

      <Card>
        <section aria-labelledby="site-geofences-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="site-geofences-title" className="text-h3 font-semibold text-navy">Geocercas</h3>
            {can.geofenceWrite && site.status === 'active' && !anonymized && geofences.length > 0 && <a className={secondaryLinkClass} href={`/geocercas/nova?unidade=${site.id}`}>Criar geocerca</a>}
          </div>
          {geofences.length === 0 ? (
            <div className="flex flex-col items-start gap-4">
              <p className="text-corpo text-texto-secundario">Esta unidade ainda não tem geocercas.</p>
              {can.geofenceWrite && site.status === 'active' && !anonymized && <a className={primaryLinkClass} href={`/geocercas/nova?unidade=${site.id}`}>Criar a primeira geocerca</a>}
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {geofences.map((geofence) => (
                <li key={geofence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-borda-suave p-4 text-corpo">
                  <span className="min-w-0">
                    <a className="font-semibold text-azul-profundo underline" href={`/geocercas/${geofence.id}`}>{geofence.name}</a>
                    <span className="block text-legenda text-texto-secundario">{GEOFENCE_SHAPE_LABELS[geofence.shape]}</span>
                  </span>
                  <EntityStatusBadge status={geofence.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </Card>

      {can.history && <RegistryHistory organizationId={organizationId} service={service} entityType="site" entityId={site.id} refreshKey={site.version} />}
    </section>
  );
}

export function SiteDetailPage(): React.JSX.Element {
  const { service, organizationId, online } = useRegistryService();
  const { permissions } = usePermissions();
  const route = resolveRegistryRoute(window.location.pathname);
  const ids = route?.area === 'customers' && (route.kind === 'site_detail' || route.kind === 'site_edit') ? { customerId: route.customerId, siteId: route.siteId } : { customerId: '', siteId: '' };
  const has = (code: string): boolean => permissions?.tenant.includes(code) ?? false;
  return (
    <AccessGate permission="customer.read">
      <SiteDetailView
        key={`${organizationId}:${ids.siteId}`}
        organizationId={organizationId}
        service={service}
        online={online}
        {...ids}
        can={{ write: has('customer.write'), deactivate: has('customer.deactivate'), history: has('customer.history'), geofenceWrite: has('geofence.write') }}
      />
    </AccessGate>
  );
}
