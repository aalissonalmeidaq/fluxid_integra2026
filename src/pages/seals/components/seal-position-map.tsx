import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SealService } from '@/application/seals/seal-service';
import type { SealGeofenceView, SealPosition } from '@/application/seals/seal-views';
import { OsmMap } from '@/components/maps/osm-map';
import type { MapPoint, MapShape } from '@/components/maps/map-types';
import { describeGeofenceRelation, formatDistance } from '@/domain/seals/seal-geofence';

// Mapa do lacre com as geocercas (Spec 012): o ponto enviado pelo lacre, a geocerca esperada em destaque (unidade em vigilância ou
// destino da viagem) e as da organização por perto, mais discretas. A lista em texto ao lado diz, sem depender do desenho nem da
// cor, se o lacre está dentro ou fora de cada uma e a que distância (RF-042). "Dentro" e a distância vêm do banco (PostGIS).

type Load = { kind: 'loading' } | { kind: 'ready'; view: SealGeofenceView } | { kind: 'error' };

const REASON: Record<'watch' | 'trip', string> = { watch: 'unidade em vigilância', trip: 'destino da viagem' };

export interface SealPositionMapProps {
  service: SealService | null;
  organizationId: string;
  deviceId: string;
  position: SealPosition;
  title: string;
  label?: string;
  details?: readonly string[];
  caption?: string;
  // Endereço aproximado no balão do ponto do lacre.
  address?: MapPoint['address'];
  className?: string;
}

export function SealPositionMap({ service, organizationId, deviceId, position, title, label, details, caption, address, className = 'w-full max-w-compacto' }: SealPositionMapProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  // Refaz a consulta quando chega uma posição nova: "dentro" e a distância mudam com ela.
  const request = useCallback(() => (service ? service.sealGeofences(organizationId, deviceId) : Promise.resolve(null)), [service, organizationId, deviceId, position.readAt]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    void request().then((outcome) => {
      if (!active || outcome === null) return;
      setLoad(outcome.kind === 'success' ? { kind: 'ready', view: outcome.value } : { kind: 'error' });
    });
    return () => { active = false; };
  }, [request]);

  const view = load.kind === 'ready' ? load.view : null;
  const shapes = useMemo<MapShape[]>(() => (view?.geofences ?? []).map((g) => ({
    ...g.shape, emphasis: g.expected ? 'destaque' : 'discreta', label: g.expected ? `${g.name} (esperada)` : g.name,
  })), [view]);

  const expected = view?.geofences.find((g) => g.expected) ?? null;
  return (
    <div className="flex flex-col gap-4">
      <OsmMap title={title} {...(label ? { label } : {})} {...(details ? { details } : {})} {...(caption ? { caption } : {})} {...(address ? { address } : {})}
        latitude={position.latitude} longitude={position.longitude} shapes={shapes} className={className} />
      {load.kind === 'error' && <p className="m-0 text-corpo text-texto-secundario">Não foi possível carregar as geocercas agora. O ponto do lacre continua no mapa.</p>}
      {view && !view.geofenceAccess && (
        <p className="m-0 text-corpo text-texto-secundario">Você não tem acesso às geocercas desta organização; o mapa mostra só o ponto do lacre.</p>
      )}
      {view && view.geofenceAccess && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-corpo text-grafite">
            {view.expectedReason
              ? (expected
                ? `Geocerca esperada: ${view.expectedSiteName ?? expected.siteName} (${REASON[view.expectedReason]}).`
                : `${view.expectedSiteName ?? 'A unidade esperada'} (${REASON[view.expectedReason]}) não tem geocerca cadastrada.`)
              : 'Sem geocerca esperada: o lacre não está em vigilância nem numa viagem em andamento.'}
          </p>
          {view.geofences.length === 0 ? (
            <p className="m-0 text-corpo text-texto-secundario">Nenhuma geocerca da organização a até {formatDistance(view.nearbyRadiusM)}.</p>
          ) : (
            <ul aria-label="Geocercas perto do lacre" className="m-0 flex list-none flex-col gap-1 p-0">
              {view.geofences.map((g) => (
                <li key={g.id} className="flex flex-wrap items-baseline gap-2 text-corpo text-grafite">
                  {g.expected && <span className="rounded-controle bg-info-fundo px-2 text-legenda font-semibold text-azul-profundo">Esperada</span>}
                  <span>{describeGeofenceRelation(g)}</span>
                  <span className="text-legenda text-texto-secundario">{g.siteName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
