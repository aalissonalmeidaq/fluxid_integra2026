import React, { useCallback, useEffect, useState } from 'react';
import type { CylinderOutcome, CylinderService } from '@/application/cylinders/cylinder-service';
import type { HistoryEvent, HistoryPage, HistoryQuery } from '@/application/cylinders/cylinder-views';
import { EVENT_LABELS, EVENT_TYPES, type CylinderEventType } from '@/domain/cylinders/cylinder-types';
import { formatDateTime } from '@/domain/cylinders/format';
import { describeEventData } from '@/domain/cylinders/history-format';
import { Alert, Button, ErrorState, Loading, Select, TextField } from '@/design-system';

const PAGE_SIZE = 25;

interface Filters { eventType: '' | CylinderEventType; from: string; to: string; order: 'asc' | 'desc' }
const INITIAL: Filters = { eventType: '', from: '', to: '', order: 'desc' };

const toQuery = (filters: Filters): HistoryQuery => ({
  order: filters.order, limit: PAGE_SIZE,
  ...(filters.eventType ? { eventType: filters.eventType } : {}),
  ...(filters.from ? { from: filters.from } : {}),
  ...(filters.to ? { to: filters.to } : {}),
});

type Phase = 'loading' | 'ready' | 'error';
type Failure = 'access_denied' | 'offline' | 'unavailable';

const failureOf = (outcome: Exclude<CylinderOutcome<unknown>, { kind: 'success' }>): Failure =>
  outcome.kind === 'access_denied' || outcome.kind === 'offline' ? outcome.kind : 'unavailable';

export interface HistoryListProps {
  organizationId: string;
  cylinderId: string;
  service: CylinderService | null;
}

// Histórico de custódia: somente leitura, em ordem estável, com filtros por tipo e período e paginação por cursor (RF-024 a RF-026).
// Correções aparecem como novos eventos que referenciam o anterior; não existe ação de alterar nem de apagar (CA-004).
export function HistoryList({ organizationId, cylinderId, service }: HistoryListProps): React.JSX.Element {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<Failure>('unavailable');
  const [reloadTick, setReloadTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const applyPage = useCallback((page: HistoryPage, append: boolean): void => {
    setEvents((current) => (append ? [...current, ...page.events] : page.events));
    setNext(page.next);
    setPhase('ready');
  }, []);

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.history(organizationId, cylinderId, toQuery(filters)).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') applyPage(outcome.value, false);
      else { setFailure(failureOf(outcome)); setPhase('error'); }
    });
    return () => { active = false; };
  }, [service, organizationId, cylinderId, filters, reloadTick, applyPage]);

  const change = (patch: Partial<Filters>): void => {
    setPhase('loading');
    setEvents([]);
    setMoreFailed(false);
    setFilters((current) => ({ ...current, ...patch }));
  };

  const loadMore = async (): Promise<void> => {
    if (!service || next === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const outcome = await service.history(organizationId, cylinderId, { ...toQuery(filters), cursor: next });
    setLoadingMore(false);
    if (outcome.kind === 'success') applyPage(outcome.value, true);
    else setMoreFailed(true);
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;

  const sequenceOf = (id: string | null): number | null => (id ? events.find((candidate) => candidate.id === id)?.sequence ?? null : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 tablet:grid-cols-2">
        <Select wrapperClassName="min-w-0" label="Tipo de evento" name="eventType" value={filters.eventType} onChange={(event) => change({ eventType: event.target.value as Filters['eventType'] })}>
          <option value="">Todos</option>
          {EVENT_TYPES.map((type) => <option key={type} value={type}>{EVENT_LABELS[type]}</option>)}
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
            message={failure === 'offline' ? 'Sem conexão. A consulta do histórico exige conexão.' : 'Você não tem permissão para ver o histórico deste cilindro.'} />)}

      {phase === 'ready' && events.length === 0 && <p className="text-corpo">Nenhum evento encontrado para estes filtros.</p>}

      {phase === 'ready' && events.length > 0 && (
        <ol className="flex flex-col gap-4" aria-label="Eventos do histórico">
          {events.map((event) => {
            const lines = describeEventData(event.eventType, event.data);
            const corrected = event.referencesEventId ? sequenceOf(event.referencesEventId) : null;
            return (
              <li key={event.id} className="flex flex-col gap-1 rounded-card border border-borda-suave p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-corpo font-semibold text-navy">{EVENT_LABELS[event.eventType]}</span>
                  <time dateTime={event.occurredAt} className="text-legenda text-texto-secundario">{formatDateTime(event.occurredAt)}</time>
                </div>
                <p className="text-legenda text-texto-secundario">Evento nº {event.sequence} · <span>{event.actorName ?? 'Sistema'}</span></p>
                {event.justification && <p className="break-words text-corpo">Justificativa: {event.justification}</p>}
                {lines.map((line) => <p key={line} className="text-corpo">{line}</p>)}
                {event.referencesEventId && (
                  <p className="text-legenda text-texto-secundario">{corrected !== null ? `Corrige o evento nº ${corrected}.` : 'Corrige um evento anterior.'}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {moreFailed && <Alert variant="erro">Não foi possível carregar mais eventos agora.</Alert>}
      {phase === 'ready' && next !== null && (
        <Button variant="secundario" className="self-start" loading={loadingMore} loadingLabel="Carregando…" onClick={() => void loadMore()}>Mostrar mais eventos</Button>
      )}
    </div>
  );
}
