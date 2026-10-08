import React, { useCallback, useEffect, useState } from 'react';
import type { RegistryOutcome, RegistryService } from '@/application/registry/registry-service';
import type { RegistryEventView, RegistryHistoryPage } from '@/application/registry/registry-views';
import { Alert, Button, Card, ErrorState, Loading, Select, TextField } from '@/design-system';
import { describeRegistryEvent } from '@/domain/registry/history-format';
import { EVENT_TYPE_LABELS, EVENT_TYPES, type RegistryEventType } from '@/domain/registry/registry-vocabulary';

const PAGE_SIZE = 25;

type EntityType = 'customer' | 'site' | 'geofence' | 'vehicle' | 'driver';

// Tipos de evento que cada área pode ter, para o filtro mostrar só opções que fazem sentido.
const TYPES_BY_AREA: Record<EntityType, (type: RegistryEventType) => boolean> = {
  customer: (type) => type.startsWith('customer_') || type === 'contacts_changed' || type === 'document_changed' || type === 'document_revealed' || type === 'person_anonymized' || type === 'contact_anonymized',
  site: (type) => type.startsWith('site_'),
  geofence: (type) => type.startsWith('geofence_'),
  vehicle: (type) => type.startsWith('vehicle_'),
  driver: (type) => type.startsWith('driver_') || type === 'document_changed' || type === 'document_revealed' || type === 'person_anonymized',
};

interface Filters { eventType: string; from: string; to: string; order: 'asc' | 'desc' }
const INITIAL: Filters = { eventType: '', from: '', to: '', order: 'desc' };

type Phase = 'loading' | 'ready' | 'error';
type Failure = 'access_denied' | 'offline' | 'unavailable';

const failureOf = (outcome: Exclude<RegistryOutcome<unknown>, { kind: 'success' }>): Failure =>
  outcome.kind === 'access_denied' || outcome.kind === 'mfa_required' ? 'access_denied' : outcome.kind === 'offline' ? 'offline' : 'unavailable';

const formatWhen = (iso: string): string => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

export interface RegistryHistoryProps {
  organizationId: string;
  service: RegistryService | null;
  entityType: EntityType;
  entityId: string;
  // Muda quando o cadastro muda na tela (por exemplo, depois de inativar): recarrega o histórico.
  refreshKey?: number;
}

// Histórico de um cadastro: somente leitura, em ordem estável, com filtro por tipo e período e paginação por cursor. Edições mostram os
// campos e valores não sensíveis; para os pessoais, só "alterado" (RF-036, RF-037). Não existe ação de alterar nem de apagar.
export function RegistryHistory({ organizationId, service, entityType, entityId, refreshKey = 0 }: RegistryHistoryProps): React.JSX.Element {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [events, setEvents] = useState<RegistryEventView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<Failure>('unavailable');
  const [reloadTick, setReloadTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [seen, setSeen] = useState<{ filters: Filters; tick: number; key: number } | null>(null);

  const toFilters = (current: Filters, cursor: string | null) => ({ eventType: current.eventType, from: current.from, to: current.to, order: current.order, limit: PAGE_SIZE, cursor });

  const applyPage = useCallback((page: RegistryHistoryPage, append: boolean): void => {
    setEvents((current) => (append ? [...current, ...page.events] : page.events));
    setNext(page.next);
    setPhase('ready');
  }, []);

  if (seen === null || seen.filters !== filters || seen.tick !== reloadTick || seen.key !== refreshKey) {
    setSeen({ filters, tick: reloadTick, key: refreshKey });
    setPhase('loading');
    setEvents([]);
    setMoreFailed(false);
  }

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void service.history(organizationId, entityType, entityId, toFilters(filters, null)).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') applyPage(outcome.value, false);
      else { setFailure(failureOf(outcome)); setPhase('error'); }
    });
    return () => { active = false; };
  }, [service, organizationId, entityType, entityId, filters, reloadTick, refreshKey, applyPage]);

  const loadMore = async (): Promise<void> => {
    if (!service || next === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const outcome = await service.history(organizationId, entityType, entityId, toFilters(filters, next));
    setLoadingMore(false);
    if (outcome.kind === 'success') applyPage(outcome.value, true);
    else setMoreFailed(true);
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;

  const options = EVENT_TYPES.filter(TYPES_BY_AREA[entityType]);

  return (
    <Card>
      <section aria-labelledby={`history-title-${entityId}`} className="flex flex-col gap-4">
        <h3 id={`history-title-${entityId}`} className="text-h3 font-semibold text-navy">Histórico</h3>
        <form noValidate onSubmit={(event) => event.preventDefault()} className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          <Select wrapperClassName="min-w-0" label="Tipo de evento" name="eventType" value={filters.eventType} onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))}>
            <option value="">Todos</option>
            {options.map((type) => <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>)}
          </Select>
          <TextField wrapperClassName="min-w-0" label="De" name="from" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          <TextField wrapperClassName="min-w-0" label="Até" name="to" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          <Select wrapperClassName="min-w-0" label="Ordem" name="order" value={filters.order} onChange={(event) => setFilters((current) => ({ ...current, order: event.target.value as Filters['order'] }))}>
            <option value="desc">Mais recentes primeiro</option>
            <option value="asc">Mais antigos primeiro</option>
          </Select>
        </form>

        {phase === 'ready' && <p role="status" className="text-corpo font-semibold text-grafite">{events.length === 0 ? 'Nenhum evento encontrado' : `${events.length} ${events.length === 1 ? 'evento exibido' : 'eventos exibidos'}`}</p>}
        {phase === 'loading' && <Loading label="Carregando o histórico…" />}
        {phase === 'error' && (failure === 'unavailable'
          ? <ErrorState title="Não foi possível carregar o histórico" message="Tente novamente em instantes." onRetry={() => setReloadTick((tick) => tick + 1)} />
          : <ErrorState variant="sem-permissao" title={failure === 'offline' ? 'Sem conexão' : 'Acesso negado'} message={failure === 'offline' ? 'Sem conexão. A consulta do histórico exige conexão.' : 'Você não tem permissão para ver o histórico.'} />)}

        {phase === 'ready' && events.length === 0 && <p className="text-corpo text-texto-secundario">Não há eventos para os filtros escolhidos.</p>}
        {phase === 'ready' && events.length > 0 && (
          <ol className="flex flex-col gap-4">
            {events.map((event) => {
              const lines = describeRegistryEvent(event.eventType, event.data);
              return (
                <li key={event.id} className="rounded-card border border-borda-suave p-4">
                  <p className="text-corpo font-semibold text-navy">{EVENT_TYPE_LABELS[event.eventType as RegistryEventType] ?? event.eventType}</p>
                  <p className="text-legenda text-texto-secundario">{formatWhen(event.occurredAt)} · {event.actorName ?? 'Pessoa não identificada'}</p>
                  {event.justification && <p className="mt-2 text-corpo">Justificativa: {event.justification}</p>}
                  {lines.length > 0 && <ul className="mt-2 list-disc ps-6 text-corpo">{lines.map((line) => <li key={line}>{line}</li>)}</ul>}
                </li>
              );
            })}
          </ol>
        )}
        {moreFailed && <Alert variant="erro">Não foi possível carregar mais eventos agora.</Alert>}
        {phase === 'ready' && next !== null && <Button variant="secundario" className="self-start" loading={loadingMore} loadingLabel="Carregando…" onClick={() => void loadMore()}>Mostrar mais eventos</Button>}
      </section>
    </Card>
  );
}
