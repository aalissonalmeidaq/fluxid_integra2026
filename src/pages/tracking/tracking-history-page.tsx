import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TrackingHistoryService, type HistoryItem } from '@/application/tracking/tracking-history-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { TrailsMap } from '@/components/maps/osm-map';
import type { MapPoint, MapTrail } from '@/components/maps/map-types';
import { Button, EmptyState, ErrorState, Icon, Loading, TextField } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import type { RuleLimits } from '@/domain/tracking/freshness';
import { parseHistoryQuery, serializeHistoryQuery, type HistoryQuery, type HistoryQueryResult } from '@/domain/tracking/history-query';
import { alertKind, type AlertKind } from '@/domain/seals/seal-vocabulary';
import { buildChronology } from '@/domain/tracking/tracking-timeline';
import { comparisonText, freshness, presenceText } from '@/domain/tracking/tracking-vocabulary';
import { TRIP_EVENT_LABELS, type TripEventType } from '@/domain/trips/trip-vocabulary';
import { createTrackingTransport } from '@/infrastructure/supabase/tracking-adapter';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { SealBadge } from '@/pages/seals/components/seal-badge';
import { MapLegend } from './components/map-legend';
import { OfflineNotice } from './components/offline-notice';

// Histórico do rastreamento (Spec 015, T061; US3, RF-019 a RF-021). A lista cronológica é permanente e completa — o mapa é o apoio
// visual, nunca a única representação; sem conexão o mapa dá lugar ao aviso e a lista carregada continua. Cada fato é dito em texto; a
// lacuna aparece como fato próprio e o mapa nunca liga pontos através dela. Carregamento progressivo sem reordenar; filtros na URL.
type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'not_found' } | { kind: 'error' } | { kind: 'offline' };
// Invólucro do fato para o agregador: o id, o instante e, nas posições, a origem; o fato original segue junto.
interface Wrapped { id: string; occurredAt: string; position?: { origin: 'mobile' | 'seal'; subjectId: string }; item: HistoryItem }

export interface TrackingHistoryScreenProps {
  service: TrackingHistoryService | null;
  organizationId: string;
  online: boolean;
  query: HistoryQueryResult;
  onQueryChange: (query: HistoryQuery) => void;
}

const FALLBACK = { latitude: -14.235, longitude: -51.925, zoom: 4 };
const pad = (n: number) => String(n).padStart(2, '0');
// Campo `datetime-local` no fuso do navegador, sem segundos.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function factText(item: HistoryItem): string {
  switch (item.kind) {
    // O frescor vai só no selo ao lado, em ícone e texto; repeti-lo aqui faria o mesmo estado aparecer duas vezes.
    case 'position': return `${item.label}${item.position.accuracyM === null ? '' : ` · ± ${Math.round(item.position.accuracyM)} m`}${item.position.retrospective ? ' · recebida depois' : ''}`;
    case 'comparison': return `${comparisonText(item.result, item.reason, item.distanceM)}${item.retrospective ? ' (avaliada depois)' : ''}`;
    case 'occurrence': return item.status === 'historical_only' ? 'Afastamento registrado só no histórico (viagem já encerrada)'
      : `Afastamento confirmado${item.detectionKind === 'retrospective' ? ' (detectado depois)' : ''}`;
    case 'alert': return `Alerta: ${alertKind(item.alertKind as AlertKind).label}`;
    case 'event': return TRIP_EVENT_LABELS[item.eventType as TripEventType] ?? item.eventType;
    default: return `${presenceText(item.source)} (presença naquele instante, não proximidade contínua)`;
  }
}

export function TrackingHistoryScreen({ service, organizationId, online, query, onQueryChange }: TrackingHistoryScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [rule, setRule] = useState<RuleLimits | null>(null);
  const [cursor, setCursor] = useState<{ at: string; id: string } | null>(null);
  const [more, setMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = query.ok ? query.query : null;
  const [draft, setDraft] = useState(() => (current ? { from: toLocalInput(current.from), to: toLocalInput(current.to) } : { from: '', to: '' }));
  const [periodError, setPeriodError] = useState<string | null>(null);

  const fetchPage = useCallback(async (after: { at: string; id: string } | null) => {
    if (!service || !organizationId || !current) return;
    setMore(true);
    const outcome = await service.page(organizationId, current, after);
    setMore(false);
    if (outcome.kind === 'success') {
      setRule(outcome.value.rule);
      setItems((previous) => (after ? [...previous, ...outcome.value.items] : outcome.value.items));
      setCursor(outcome.value.nextCursor);
      setLoad({ kind: 'ready' });
    } else if (!after) setLoad(outcome.kind === 'not_found' || outcome.kind === 'access_denied' ? { kind: 'not_found' } : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' });
  }, [service, organizationId, current]);

  useEffect(() => {
    if (!online || !current || !service || !organizationId) return undefined;
    let active = true;
    void service.page(organizationId, current, null).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') {
        setRule(outcome.value.rule);
        setItems(outcome.value.items);
        setCursor(outcome.value.nextCursor);
        setLoad({ kind: 'ready' });
      } else setLoad(outcome.kind === 'not_found' || outcome.kind === 'access_denied' ? { kind: 'not_found' } : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' });
    });
    return () => { active = false; };
    // A consulta é identificada pelo assunto e pelo período; trocar de empresa remonta a tela (chave).
  }, [online, service, organizationId, current?.subject, current?.subjectId, current?.from, current?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const chronology = useMemo(() => {
    if (!rule) return null;
    const wrapped: Wrapped[] = items.map((item) => ({ id: item.id, occurredAt: item.occurredAt, item,
      ...(item.kind === 'position' ? { position: { origin: item.position.origin, subjectId: item.subjectId } } : {}) }));
    return buildChronology(wrapped, rule);
  }, [items, rule]);

  // Anúncio único da quantidade carregada (muda só quando a lista muda, sem mover o foco).
  const status = chronology && load.kind === 'ready'
    ? `${chronology.entries.length} ${chronology.entries.length === 1 ? 'fato carregado' : 'fatos carregados'}.` : '';

  const positions = useMemo(() => new Map(items.flatMap((item) => (item.kind === 'position' ? [[item.id, item] as const] : []))), [items]);
  const trails = useMemo<MapTrail[]>(() => (chronology?.segments ?? []).map((segment, index) => ({
    id: `${segment.key}:${index}`, origin: segment.origin,
    coordinates: segment.positionIds.flatMap((id) => { const p = positions.get(id); return p && p.kind === 'position' ? [{ latitude: p.position.latitude, longitude: p.position.longitude }] : []; }),
  })), [chronology, positions]);
  const points = useMemo<MapPoint[]>(() => (chronology?.segments ?? []).flatMap((segment) => {
    const ids = [segment.positionIds[segment.positionIds.length - 1]!, ...(selectedId && segment.positionIds.includes(selectedId) ? [selectedId] : [])];
    return [...new Set(ids)].flatMap((id) => {
      const p = positions.get(id);
      return p && p.kind === 'position' ? [{ id, label: `${p.label}: ${formatDateTime(p.occurredAt)}`, latitude: p.position.latitude, longitude: p.position.longitude,
        origin: p.position.origin, selected: id === selectedId }] : [];
    });
  }), [chronology, positions, selectedId]);

  if (!query.ok) {
    return query.reason === 'missing_subject'
      ? <EmptyState title="Escolha o que investigar" description="Abra o histórico a partir de uma viagem ou de um cilindro: o link fica no acompanhamento da viagem." />
      : <ErrorState variant="sem-permissao" title="Endereço inválido" message="A consulta do histórico neste endereço não é válida. Abra-a de novo a partir da viagem ou do cilindro." />;
  }
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const from = new Date(draft.from);
    const to = new Date(draft.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return setPeriodError('Informe data e hora de início e de fim.');
    if (from >= to) return setPeriodError('O início deve ser antes do fim.');
    if (to.getTime() - from.getTime() > 31 * 24 * 3600_000) return setPeriodError('Escolha um período de até 31 dias.');
    setPeriodError(null);
    onQueryChange({ ...query.query, from: from.toISOString(), to: to.toISOString() });
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <a className="inline-flex min-h-alvo items-center self-start text-corpo text-azul-profundo underline" href={query.query.subject === 'trip' ? `/rastreamento/viagens/${query.query.subjectId}` : '/rastreamento'}>
          {query.query.subject === 'trip' ? 'Acompanhamento da viagem' : 'Rastreamento'}
        </a>
        <h2 className="m-0 text-h3 font-semibold text-navy">{query.query.subject === 'trip' ? 'Histórico da viagem' : 'Histórico do cilindro'}</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">Posições, comparações, ocorrências e eventos em ordem. Onde não há posição, a lacuna aparece como tal: o trajeto não é presumido.</p>
      </header>
      <p role="status" aria-atomic="true" className="sr-only">{status}</p>
      <form className="flex flex-col gap-4 tablet:flex-row tablet:flex-wrap tablet:items-end" noValidate onSubmit={apply}>
        <TextField label="Início" type="datetime-local" value={draft.from} error={periodError ?? undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        <TextField label="Fim" type="datetime-local" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        <div><Button type="submit" variant="secundario">Aplicar período</Button></div>
      </form>
      {load.kind === 'loading' && <Loading variant="pagina" busy label="Carregando o histórico…" />}
      {load.kind === 'offline' && <OfflineNotice>Sem conexão: o histórico aparece quando a conexão voltar.</OfflineNotice>}
      {load.kind === 'not_found' && <ErrorState variant="sem-permissao" title="Registro não encontrado" message="Esta viagem ou este cilindro não existe na empresa ativa ou não está disponível para você." />}
      {load.kind === 'error' && <ErrorState title="Não foi possível carregar o histórico" message="Tente novamente em instantes." onRetry={() => { setLoad({ kind: 'loading' }); void fetchPage(null); }} />}
      {load.kind === 'ready' && chronology && (chronology.entries.length === 0 ? (
        <EmptyState title="Nada registrado neste período" description="Escolha outro período ou confira se a coleta estava ativa." />
      ) : (
        <div className="flex min-w-0 flex-col gap-6 desktop:grid desktop:grid-cols-2 desktop:items-start">
          {online ? (
            <div className="flex min-w-0 flex-col gap-2">
              <TrailsMap title="Mapa do trajeto do período" points={points} trails={trails} fallback={FALLBACK} onSelect={setSelectedId} />
              <MapLegend />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-borda-controle bg-cinza-gelo p-6 text-center">
              <span className="text-azul-profundo"><Icon name="mapa" size={32} /></span>
              <p className="m-0 text-corpo text-grafite">O mapa precisa de conexão. Os fatos continuam descritos em texto na cronologia.</p>
            </div>
          )}
          <div className="flex flex-col gap-4">
            <ol aria-label="Cronologia do período" className="m-0 flex list-none flex-col gap-2 p-0">
              {chronology.entries.map((entry) => {
                if (!('item' in entry)) {
                  return (
                    <li key={entry.id} className="flex items-start gap-2 rounded-card border border-dashed border-borda-controle p-2 text-corpo text-grafite">
                      <Icon name="sem-sinal" size={16} variant="monocromatica" />
                      <span>Sem posição {entry.origin === 'mobile' ? 'do celular' : 'do lacre'} entre {formatDateTime(entry.occurredAt)} e {formatDateTime(entry.endedAt)}</span>
                    </li>
                  );
                }
                const { item } = entry;
                const when = formatDateTime(item.occurredAt);
                if (item.kind === 'position') {
                  const selected = selectedId === item.id;
                  return (
                    <li key={item.id}>
                      <button type="button" aria-pressed={selected} onClick={() => setSelectedId(item.id)}
                        className={['flex min-h-alvo w-full flex-wrap items-center gap-2 rounded-card border p-2 text-left text-corpo text-grafite', selected ? 'border-navy bg-info-fundo' : 'border-borda-suave bg-branco'].join(' ')}>
                        <span className="tabular-nums text-texto-secundario">{when}</span>
                        <span>{factText(item)}</span>
                        <SealBadge presentation={freshness(item.position.freshness)} />
                      </button>
                    </li>
                  );
                }
                // Afastamento e alerta são os fatos graves: ícone e texto em vermelho; o afastamento leva à ocorrência, onde é tratado.
                const grave = item.kind === 'occurrence' || item.kind === 'alert';
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-card border border-borda-suave bg-branco p-2 text-corpo text-grafite">
                    <span className="tabular-nums text-texto-secundario">{when}</span>
                    {grave ? (
                      <span className="flex items-center gap-1 font-semibold text-erro">
                        <Icon name="alerta" size={16} variant="monocromatica" />
                        {item.kind === 'occurrence'
                          ? <a className="inline-flex min-h-alvo items-center text-erro underline" href={`/rastreamento/ocorrencias/${item.id}`}>{factText(item)}</a>
                          : factText(item)}
                      </span>
                    ) : <span>{factText(item)}</span>}
                  </li>
                );
              })}
            </ol>
            {cursor && <div><Button variant="secundario" loading={more} loadingLabel="Carregando…" onClick={() => void fetchPage(cursor)}>Carregar mais</Button></div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrackingHistoryPage(): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => (endpoint && client ? new TrackingHistoryService(createTrackingTransport(endpoint, client), () => navigator.onLine !== false) : null), [client, endpoint]);
  const [search, setSearch] = useState(() => window.location.search);
  const query = useMemo(() => parseHistoryQuery(new URLSearchParams(search)), [search]);
  const organizationId = activeOrganizationId ?? '';
  const change = (next: HistoryQuery) => {
    const params = `?${serializeHistoryQuery(next).toString()}`;
    window.history.pushState(null, '', `${window.location.pathname}${params}`);
    setSearch(params);
  };
  return (
    <AccessGate permission="tracking.read">
      <TrackingHistoryScreen key={`${organizationId}:${search}`} service={service} organizationId={organizationId} online={online} query={query} onQueryChange={change} />
    </AccessGate>
  );
}
