import React, { useCallback, useEffect, useState } from 'react';
import type { TripOutcome, TripService } from '@/application/trips/trip-service';
import type { TripEventPage } from '@/application/trips/trip-views';
import { Alert, Button, ErrorState, Loading, Select, TextField } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { describeTripEvent } from '@/domain/trips/trip-history-format';
import { TRIP_EVENT_LABELS, TRIP_EVENT_TYPES, type TripEventType } from '@/domain/trips/trip-vocabulary';

const PAGE_SIZE = 25;

interface Filters { eventType: '' | TripEventType; from: string; to: string; order: 'asc' | 'desc' }
const INITIAL: Filters = { eventType: '', from: '', to: '', order: 'desc' };

type Phase = 'loading' | 'ready' | 'error';
type Failure = 'access_denied' | 'offline' | 'unavailable';

const failureOf = (outcome: Exclude<TripOutcome<unknown>, { kind: 'success' }>): Failure =>
  outcome.kind === 'access_denied' || outcome.kind === 'offline' ? outcome.kind : 'unavailable';

export interface TripHistoryListProps {
  organizationId: string;
  tripId: string;
  service: TripService | null;
  // Muda quando a viagem muda (a versão), para o histórico recarregar sem a pessoa pedir.
  refreshKey?: number;
  // Traduz ids de veículo e motorista (valores guardados nas edições) para o texto exibido.
  names?: Record<string, string>;
}

// Histórico da viagem: somente leitura, em ordem estável, com filtros por tipo e período e paginação por cursor (RF-025). Não há ação de
// alterar nem de apagar e nenhum dado pessoal do recebedor chega aqui (RF-032, CA-006).
export function TripHistoryList({ organizationId, tripId, service, refreshKey = 0, names = {} }: TripHistoryListProps): React.JSX.Element {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [page, setPage] = useState<TripEventPage>({ events: [], next: null });
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<Failure>('unavailable');
  const [reloadTick, setReloadTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const toQuery = useCallback((current: Filters, cursor?: string) => ({
    order: current.order, limit: PAGE_SIZE,
    ...(current.eventType ? { eventType: current.eventType } : {}),
    ...(current.from ? { from: current.from } : {}),
    ...(current.to ? { to: current.to } : {}),
    ...(cursor ? { cursor } : {}),
  }), []);

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.tripHistory(organizationId, tripId, toQuery(filters)).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') { setPage(outcome.value); setPhase('ready'); }
      else { setFailure(failureOf(outcome)); setPhase('error'); }
    });
    return () => { active = false; };
  }, [service, organizationId, tripId, filters, refreshKey, reloadTick, toQuery]);

  const change = (patch: Partial<Filters>): void => {
    setPhase('loading');
    setPage({ events: [], next: null });
    setMoreFailed(false);
    setFilters((current) => ({ ...current, ...patch }));
  };

  const loadMore = async (): Promise<void> => {
    if (!service || page.next === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const outcome = await service.tripHistory(organizationId, tripId, toQuery(filters, page.next));
    setLoadingMore(false);
    if (outcome.kind === 'success') setPage((current) => ({ events: [...current.events, ...outcome.value.events], next: outcome.value.next }));
    else setMoreFailed(true);
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 tablet:grid-cols-2">
        <Select wrapperClassName="min-w-0" label="Tipo de evento" name="eventType" value={filters.eventType} onChange={(event) => change({ eventType: event.target.value as Filters['eventType'] })}>
          <option value="">Todos</option>
          {TRIP_EVENT_TYPES.map((type) => <option key={type} value={type}>{TRIP_EVENT_LABELS[type]}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-4 tablet:contents">
          <TextField wrapperClassName="min-w-0" label="De" name="from" type="date" value={filters.from} onChange={(event) => change({ from: event.target.value })} />
          <TextField wrapperClassName="min-w-0" label="Até" name="to" type="date" value={filters.to} onChange={(event) => change({ to: event.target.value })} />
        </div>
        <Select wrapperClassName="min-w-0" label="Ordem" name="order" value={filters.order} onChange={(event) => change({ order: event.target.value as Filters['order'] })}>
          <option value="desc">Mais recentes primeiro</option>
          <option value="asc">Mais antigos primeiro</option>
        </Select>
      </div>

      {phase === 'loading' && <Loading label="Carregando o histórico…" />}
      {phase === 'error' && (failure === 'unavailable'
        ? <ErrorState title="Não foi possível carregar o histórico" message="Tente novamente em instantes." onRetry={() => { setPhase('loading'); setReloadTick((tick) => tick + 1); }} />
        : <ErrorState variant="sem-permissao" title={failure === 'offline' ? 'Sem conexão' : 'Acesso negado'}
            message={failure === 'offline' ? 'Sem conexão. A consulta do histórico exige conexão.' : 'Você não tem permissão para ver o histórico desta viagem.'} />)}

      {phase === 'ready' && page.events.length === 0 && <p className="text-corpo">Nenhum evento encontrado para estes filtros.</p>}

      {phase === 'ready' && page.events.length > 0 && (
        <ol className="flex flex-col gap-4" aria-label="Eventos do histórico da viagem">
          {page.events.map((event) => (
            <li key={event.id} className="flex flex-col gap-1 rounded-card border border-borda-suave p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-corpo font-semibold text-navy">{TRIP_EVENT_LABELS[event.eventType]}</span>
                <time dateTime={event.occurredAt} className="text-legenda text-texto-secundario">{formatDateTime(event.occurredAt)}</time>
              </div>
              <p className="text-legenda text-texto-secundario">Evento nº {event.sequence} · <span>{event.actorName ?? 'Sistema'}</span></p>
              <p className="break-words text-corpo">{describeTripEvent(event.eventType, event.data, names)}</p>
              {event.justification && <p className="break-words text-corpo">Justificativa: {event.justification}</p>}
            </li>
          ))}
        </ol>
      )}

      {moreFailed && <Alert variant="erro">Não foi possível carregar mais eventos agora.</Alert>}
      {phase === 'ready' && page.next !== null && (
        <Button variant="secundario" className="self-start" loading={loadingMore} loadingLabel="Carregando…" onClick={() => void loadMore()}>Mostrar mais eventos</Button>
      )}
    </div>
  );
}
