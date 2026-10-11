import React, { useCallback, useEffect, useState } from 'react';
import type { TripOutcome, TripService } from '@/application/trips/trip-service';
import type { TripOfCylinder, TripOfSite } from '@/application/trips/trip-views';
import { Alert, Button, ErrorState, Loading } from '@/design-system';
import { formatDate } from '@/domain/cylinders/format';
import { ItemStatusBadge, OverdueBadge, StopStatusBadge, TripStatusBadge } from './trip-badges';

const PAGE_SIZE = 10;

type Entry = TripOfCylinder | TripOfSite;
type Phase = 'loading' | 'ready' | 'error';
type Failure = 'access_denied' | 'offline' | 'unavailable';
type Subject = { kind: 'cylinder' | 'site'; id: string };

const failureOf = (outcome: Exclude<TripOutcome<unknown>, { kind: 'success' }>): Failure =>
  outcome.kind === 'access_denied' || outcome.kind === 'offline' ? outcome.kind : 'unavailable';

export interface TripsOfBlockProps {
  organizationId: string;
  service: TripService | null;
  // De quem são as viagens: de um cilindro ou de uma unidade de cliente.
  subject: Subject;
}

// "Viagens" nos detalhes de cilindro e de unidade (RF-027): da mais recente para a mais antiga, cada uma com a situação daquele
// cilindro ou daquela parada na viagem. Quem monta o bloco decide se a pessoa pode vê-lo (trip.read mais a leitura do cadastro de origem).
export function TripsOfBlock({ organizationId, service, subject }: TripsOfBlockProps): React.JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<Failure>('unavailable');
  const [reloadTick, setReloadTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const fetchPage = useCallback((cursor?: string): Promise<TripOutcome<{ items: Entry[]; next: string | null }>> => {
    if (!service) return Promise.resolve({ kind: 'unavailable' });
    const page = { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) };
    return subject.kind === 'cylinder' ? service.tripsOfCylinder(organizationId, subject.id, page) : service.tripsOfSite(organizationId, subject.id, page);
  }, [service, organizationId, subject.kind, subject.id]);

  useEffect(() => {
    if (!service) return undefined;
    let active = true;
    void fetchPage().then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') { setEntries(outcome.value.items); setNext(outcome.value.next); setPhase('ready'); }
      else { setFailure(failureOf(outcome)); setPhase('error'); }
    });
    return () => { active = false; };
  }, [service, fetchPage, reloadTick]);

  const loadMore = async (): Promise<void> => {
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    const outcome = await fetchPage(next);
    setLoadingMore(false);
    if (outcome.kind === 'success') { setEntries((current) => [...current, ...outcome.value.items]); setNext(outcome.value.next); }
    else setMoreFailed(true);
  };

  if (!service) return <ErrorState title="Conexão indisponível" message="Não foi possível falar com o servidor agora." />;

  return (
    <div className="flex flex-col gap-4">
      {phase === 'loading' && <Loading label="Carregando as viagens…" />}
      {phase === 'error' && (failure === 'unavailable'
        ? <ErrorState title="Não foi possível carregar as viagens" message="Tente novamente em instantes." onRetry={() => { setPhase('loading'); setReloadTick((tick) => tick + 1); }} />
        : <ErrorState variant="sem-permissao" title={failure === 'offline' ? 'Sem conexão' : 'Acesso negado'}
            message={failure === 'offline' ? 'Sem conexão. A consulta de viagens exige conexão.' : 'Você não tem permissão para ver as viagens.'} />)}
      {phase === 'ready' && entries.length === 0 && (
        <p className="text-corpo">{subject.kind === 'cylinder' ? 'Este cilindro ainda não esteve em nenhuma viagem.' : 'Esta unidade ainda não tem viagens.'}</p>
      )}
      {phase === 'ready' && entries.length > 0 && (
        <ul className="flex flex-col gap-4" aria-label="Viagens">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-2 rounded-card border border-borda-suave p-4 tablet:flex-row tablet:items-center tablet:justify-between">
              <div className="flex flex-col gap-1">
                <a className="font-semibold text-azul-profundo underline" href={`/viagens/${entry.id}`}>{`Viagem n.º ${entry.number}`}</a>
                <span className="flex flex-wrap items-center gap-2 text-corpo">Data prevista: {formatDate(entry.plannedDate)}{entry.overdue && <OverdueBadge />}</span>
              </div>
              <span className="flex flex-wrap items-center gap-2">
                <TripStatusBadge status={entry.status} />
                {'itemStatus' in entry ? <ItemStatusBadge status={entry.itemStatus} /> : <StopStatusBadge status={entry.stopStatus} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {moreFailed && <Alert variant="erro">Não foi possível carregar mais viagens agora.</Alert>}
      {phase === 'ready' && next !== null && (
        <Button variant="secundario" className="self-start" loading={loadingMore} loadingLabel="Carregando…" onClick={() => void loadMore()}>Mostrar mais viagens</Button>
      )}
    </div>
  );
}
