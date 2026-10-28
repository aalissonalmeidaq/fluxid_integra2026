import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { watchTracking, type TrackingRealtimePort } from '@/application/tracking/tracking-realtime';
import { keepSelection, type TrackingOutcome, type TripTrackingService } from '@/application/tracking/trip-tracking-service';
import type { OriginView, TrackingTimelineView } from '@/application/tracking/tracking-views';
import { useMinWidth } from '@/app/use-min-width';
import { TrailsMap } from '@/components/maps/osm-map';
import type { MapPoint, MapTrail } from '@/components/maps/map-types';
import { Alert, ErrorState, Loading } from '@/design-system';
import { pontosDeQuebra } from '@/design-system/tokens';
import { formatDateTime } from '@/domain/cylinders/format';
import { positionAge } from '@/domain/seals/seal-age';
import { serializeHistoryQuery } from '@/domain/tracking/history-query';
import { degradationText, freshness } from '@/domain/tracking/tracking-vocabulary';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import { MapLegend } from './components/map-legend';
import { OfflineNotice } from './components/offline-notice';
import { TrackingTimeline } from './components/tracking-timeline';
import { useTrackingService } from './use-tracking-service';

// Acompanhamento de uma viagem em andamento (Spec 015, US1; RF-001 a RF-006, RF-039 a RF-041). Mapa e lista recebem a mesma view: a
// lista é permanente e completa; abaixo de 768 px ela é a visão padrão e o mapa abre pela alternância. Atualiza pelo aviso em tempo
// real (ou a cada 30 s) e anuncia num único status, sem mover o foco nem perder a seleção. Sem conexão, mantém a informação anterior
// identificada com o horário.
type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; view: TrackingTimelineView }
  | { kind: 'not_found' }
  | { kind: 'error' }
  | { kind: 'offline' };

export interface TripTrackingScreenProps {
  service: TripTrackingService | null;
  organizationId: string;
  tripId: string;
  online: boolean;
  realtime: TrackingRealtimePort | null;
  now?: () => Date;
}

const FALLBACK = { latitude: -14.235, longitude: -51.925, zoom: 4 };
// Histórico desde o início da viagem (no máximo 31 dias, o limite da consulta) até agora.
const historyHref = (tripId: string, startedAt: string, now: string) => {
  const from = new Date(Math.max(Date.parse(startedAt), Date.parse(now) - 31 * 24 * 3600_000 + 60_000)).toISOString();
  return `/rastreamento/historico?${serializeHistoryQuery({ subject: 'trip', subjectId: tripId, from, to: new Date(now).toISOString() }).toString()}`;
};
const clock = (iso: string) => formatDateTime(iso).split(' ')[1] ?? formatDateTime(iso);
const precision = (accuracy: number | null) => (accuracy === null ? 'precisão desconhecida' : `± ${Math.round(accuracy)} m`);
// Link de texto com alvo de 44 px de altura, sem mudar o visual (o texto continua sublinhado).
const TEXT_LINK = 'inline-flex min-h-alvo items-center self-start text-corpo text-azul-profundo underline';

function OriginList({ origins, now }: { origins: readonly OriginView[]; now: Date }): React.JSX.Element {
  return (
    <ul aria-label="Origens de posição" className="m-0 grid list-none gap-2 p-0 tablet:grid-cols-2 desktop:grid-cols-3">
      {origins.map((origin) => (
        <li key={origin.key} className="flex flex-col items-start gap-1 rounded-card border border-borda-suave bg-branco p-4 text-corpo text-grafite">
          <span className="font-semibold text-navy">{origin.label}</span>
          <SealBadge presentation={freshness(origin.freshness)} />
          {origin.position ? (
            <span className="text-legenda text-texto-secundario">
              {positionAge(origin.position.confirmedAt ?? origin.position.observedAt, now)} · {formatDateTime(origin.position.observedAt)} · {precision(origin.position.accuracyM)}
              {origin.position.retrospective ? ' · recebida depois' : ''}
            </span>
          ) : (
            <span className="text-legenda text-texto-secundario">Nenhuma posição recebida nesta viagem.</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function TripTrackingScreen({ service, organizationId, tripId, online, realtime, now = () => new Date() }: TripTrackingScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'lista' | 'mapa'>('lista');
  const [announcement, setAnnouncement] = useState('');
  const wide = useMinWidth(pontosDeQuebra.tablet);

  const request = useCallback(() => (service && organizationId ? service.getTrip(organizationId, tripId) : Promise.resolve(null)), [service, organizationId, tripId]);
  const apply = useCallback((outcome: TrackingOutcome<TrackingTimelineView> | null, announce: boolean) => {
    if (outcome === null) return;
    if (outcome.kind === 'success') {
      setLoad({ kind: 'ready', view: outcome.value });
      const ids = outcome.value.positions.map((position) => position.id);
      setSelectedId((current) => keepSelection(current, ids));
      if (announce) setAnnouncement(`Acompanhamento atualizado às ${clock(outcome.value.generatedAt)}.`);
      return;
    }
    // Numa atualização, uma falha passageira mantém o que está na tela.
    setLoad((current) => (current.kind === 'ready' && announce ? current
      : outcome.kind === 'not_found' || outcome.kind === 'access_denied' ? { kind: 'not_found' }
        : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' }));
  }, []);
  const refresh = useCallback(async (announce: boolean) => apply(await request(), announce), [request, apply]);

  useEffect(() => {
    if (!online) return undefined;
    let active = true;
    void request().then((outcome) => { if (active) apply(outcome, false); });
    return () => { active = false; };
  }, [online, request, apply]);

  useEffect(() => {
    if (!online || !service || !realtime || !organizationId) return undefined;
    const watch = watchTracking({ port: realtime, organizationId, tripId, onChange: () => void refresh(true) });
    return () => watch.stop();
  }, [online, service, realtime, organizationId, tripId, refresh]);

  const view = load.kind === 'ready' ? load.view : null;
  const points = useMemo<MapPoint[]>(() => {
    if (!view) return [];
    const latest = view.trip.origins.flatMap((origin) => (origin.position ? [{ ...origin.position, label: origin.label }] : []));
    const chosen = view.positions.find((position) => position.id === selectedId);
    const all = chosen && !latest.some((position) => position.id === chosen.id)
      ? [...latest, { ...chosen, label: view.trip.origins.find((o) => o.subjectId === chosen.subjectId)?.label ?? '' }] : latest;
    return all.map((position) => ({
      id: position.id, label: `${position.label}: ${freshness(position.freshness).label}`, latitude: position.latitude, longitude: position.longitude,
      origin: position.origin, selected: position.id === selectedId,
    }));
  }, [view, selectedId]);
  const trails = useMemo<MapTrail[]>(() => {
    if (!view) return [];
    const byId = new Map(view.positions.map((position) => [position.id, position]));
    return view.segments.map((segment) => ({
      id: segment.id, origin: segment.origin,
      coordinates: segment.positionIds.flatMap((id) => { const p = byId.get(id); return p ? [{ latitude: p.latitude, longitude: p.longitude }] : []; }),
    }));
  }, [view]);

  if (load.kind === 'loading') return <Loading variant="pagina" busy label="Carregando o acompanhamento…" />;
  if (load.kind === 'not_found') {
    return <ErrorState variant="sem-permissao" title="Viagem não encontrada" message="Esta viagem não existe na empresa ativa ou não está disponível para você." />;
  }
  if (load.kind === 'error') return <ErrorState title="Não foi possível carregar o acompanhamento" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void refresh(false); }} />;
  if (load.kind === 'offline' || !view) return <OfflineNotice>Sem conexão: o acompanhamento aparece quando a conexão voltar.</OfflineNotice>;

  const { trip } = view;
  const showMap = wide || mode === 'mapa';
  const showList = wide || mode === 'lista';
  const history = historyHref(trip.tripId, trip.startedAt, view.generatedAt);
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <a className={TEXT_LINK} href="/rastreamento">Viagens em andamento</a>
        <h2 className="m-0 text-h3 font-semibold text-navy">Viagem {trip.tripNumber}</h2>
        <p className="m-0 text-corpo text-grafite">Veículo {trip.vehiclePlate} · Motorista {trip.driverName} · Atualizado em {formatDateTime(view.generatedAt)}</p>
        <a className={TEXT_LINK} href={history}>Histórico desta viagem</a>
      </header>
      <p role="status" aria-atomic="true" className="sr-only">{announcement}</p>
      {/* O fato mais grave vem primeiro: um afastamento confirmado e ainda aberto. A ocorrência se abre pelo histórico ou pelo alerta. */}
      {trip.openOccurrences > 0 && (
        <Alert variant="erro" title="Afastamento confirmado nesta viagem">
          <p className="m-0">
            {trip.openOccurrences} {trip.openOccurrences === 1 ? 'ocorrência aberta' : 'ocorrências abertas'}: o celular do motorista e um lacre ficaram
            afastados. Confira a carga com o motorista.
          </p>
          <a className={TEXT_LINK} href={history}>Ver no histórico da viagem</a>
        </Alert>
      )}
      {!online && (
        <Alert variant="informacao" title="Informação anterior">
          Sem conexão: informação anterior, de {formatDateTime(view.generatedAt)}. Ela não é a posição atual.
        </Alert>
      )}
      {trip.degradation && (
        <Alert variant="alerta" title="Acompanhamento degradado">
          {degradationText(trip.degradation.reason)} (desde {formatDateTime(trip.degradation.since)}). Nenhum afastamento é confirmado sem posição válida.
        </Alert>
      )}
      <OriginList origins={trip.origins} now={now()} />
      {!wide && (
        <div role="group" aria-label="Forma de ver" className="flex gap-2">
          {(['lista', 'mapa'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={['min-h-alvo flex-1 rounded-controle border px-4 text-corpo font-semibold', mode === value ? 'border-navy bg-navy text-branco' : 'border-borda-controle bg-branco text-navy'].join(' ')}
            >
              {value === 'lista' ? 'Lista' : 'Mapa'}
            </button>
          ))}
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-6 desktop:grid desktop:grid-cols-2 desktop:items-start">
        {showMap && (
          <div className="flex min-w-0 flex-col gap-2">
            <TrailsMap title="Mapa do trajeto recente" points={points} trails={trails} fallback={FALLBACK} onSelect={setSelectedId} />
            <MapLegend />
          </div>
        )}
        {showList && <TrackingTimeline items={view.items} origins={trip.origins} selectedId={selectedId} onSelect={setSelectedId} />}
      </div>
    </div>
  );
}

export function TripTrackingPage({ tripId }: { tripId: string }): React.JSX.Element {
  const { service, realtime, organizationId, online } = useTrackingService();
  return (
    <AccessGate permission="tracking.read">
      <TripTrackingScreen key={`${organizationId}:${tripId}`} service={service} organizationId={organizationId} tripId={tripId} online={online} realtime={realtime} />
    </AccessGate>
  );
}
