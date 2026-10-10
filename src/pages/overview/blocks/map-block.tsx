import React, { useEffect, useMemo, useState } from 'react';
import type { SitePoints } from '@/application/registry/registry-views';
import { usePermissions } from '@/app/navigation/permissions-context';
import { PointsMap } from '@/components/maps/osm-map';
import type { MapPoint } from '@/components/maps/map-types';
import type { OverviewBlockState } from '@/domain/overview/overview-types';
import { useRegistryService } from '@/pages/registry/use-registry-service';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Mapa da Visão geral: com a permissão `customer.read`, mostra as unidades ativas dos clientes que têm coordenadas, no endereço
// que foi confirmado ou digitado. Sem a permissão (ou sem o serviço), mostra a região de exemplo, rotulada "Exemplo" (RF-011).
type Load = { kind: 'loading' } | { kind: 'ready'; points: SitePoints } | { kind: 'error' };

const BRASIL = { latitude: -14.235, longitude: -51.9253, zoom: 4 };

function ExampleMap(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('mapa');
  return (
    <OverviewBlock id="mapa" title="Mapa da operação" state={state} onRetry={retry} className="w-full">
      {state.status === 'ready' && (
        <div className="flex flex-1 flex-col gap-2">
          <PointsMap
            title="Mapa da região de exemplo"
            points={[]}
            fallback={{ latitude: state.data.center.latitude, longitude: state.data.center.longitude, zoom: 9 }}
            className="flex-1"
          />
          <p className="max-w-padrao break-words text-corpo text-grafite">{state.data.message}</p>
        </div>
      )}
    </OverviewBlock>
  );
}

function SitesMap({ organizationId }: { organizationId: string }): React.JSX.Element {
  const { service } = useRegistryService();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!service) return undefined;
    let current = true;
    void service.listSitePoints(organizationId).then((outcome) => {
      if (current) setLoad(outcome.kind === 'success' ? { kind: 'ready', points: outcome.value } : { kind: 'error' });
    });
    return () => { current = false; };
  }, [service, organizationId, attempt]);

  const points = useMemo<MapPoint[]>(() => (load.kind === 'ready' ? load.points.items.map((site) => ({
    id: site.id, label: site.name, latitude: site.latitude, longitude: site.longitude, confirmed: site.confirmed,
    details: [site.customerName, `${site.city}/${site.state}`, site.confirmed ? 'Coordenadas confirmadas' : 'Coordenadas sem confirmação'],
    href: `/clientes/${site.customerId}/unidades/${site.id}`,
  })) : []), [load]);

  const state: OverviewBlockState = load.kind === 'loading' ? { status: 'loading' } : load.kind === 'error' ? { status: 'error' } : { status: 'ready', data: null };
  const total = load.kind === 'ready' ? load.points.total : 0;

  return (
    <OverviewBlock id="mapa" title="Mapa da operação" state={state} onRetry={() => { setLoad({ kind: 'loading' }); setAttempt((value) => value + 1); }} className="w-full" example={false}>
      <div className="flex flex-1 flex-col gap-2">
        <PointsMap title="Mapa das unidades dos clientes" points={points} fallback={BRASIL} className="flex-1" />
        <p role="status" className="break-words text-corpo text-grafite">
          {points.length === 0
            ? 'Nenhuma unidade com coordenadas ainda. Busque ou informe as coordenadas ao cadastrar uma unidade.'
            : total > points.length
              ? `Mostrando ${points.length} de ${total} unidades com coordenadas.`
              : `${points.length} ${points.length === 1 ? 'unidade' : 'unidades'} com coordenadas. Azul: confirmadas; ciano: sem confirmação.`}
        </p>
        {points.length > 0 && (
          <details className="text-corpo text-grafite">
            <summary className="min-h-alvo cursor-pointer font-semibold text-azul-profundo">Lista das unidades no mapa</summary>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 pt-2">
              {points.map((point) => (
                <li key={point.id}><a className="font-semibold text-azul-profundo underline" href={point.href}>{point.label}</a> · {(point.details ?? []).slice(0, 2).join(' · ')}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </OverviewBlock>
  );
}

export function MapBlock(): React.JSX.Element {
  const { permissions } = usePermissions();
  const { service, organizationId } = useRegistryService();
  const canRead = permissions?.tenant.includes('customer.read') ?? false;
  return canRead && service && organizationId !== '' ? <SitesMap organizationId={organizationId} /> : <ExampleMap />;
}
