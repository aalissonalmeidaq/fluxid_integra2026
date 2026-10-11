import React, { useCallback, useEffect, useState } from 'react';
import type { TripService } from '@/application/trips/trip-service';
import type { EligibleCylinderView } from '@/application/trips/trip-views';
import { Alert, Button, TextField } from '@/design-system';
import { HYDROSTATIC_LABELS } from '@/domain/cylinders/cylinder-types';

export interface CylinderPickerProps {
  service: TripService | null;
  organizationId: string;
  // Cilindros que já estão na viagem (em qualquer parada): não são oferecidos de novo.
  excludedIds: ReadonlySet<string>;
  // Quantos cilindros ainda cabem no veículo; nulo enquanto o veículo não foi escolhido.
  remaining: number | null;
  disabled?: boolean;
  onAdd: (cylinder: EligibleCylinderView) => void;
  onAnnounce: (message: string) => void;
}

const PAGE_SIZE = 10;
type Phase = 'loading' | 'ready' | 'error' | 'offline';

// Busca paginada de cilindros elegíveis (ativos, em estoque, com teste em dia ou a vencer e sem reserva aberta). Cada resultado tem
// um botão "Adicionar" alcançável por teclado; o resultado da ação vai à região de status única da tela (RF-005, CA-008).
export function CylinderPicker({ service, organizationId, excludedIds, remaining, disabled = false, onAdd, onAnnounce }: CylinderPickerProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<EligibleCylinderView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [tick, setTick] = useState(0);
  const [seen, setSeen] = useState({ search: '', tick: 0 });

  // Nova busca ou nova tentativa: o estado "carregando" é marcado no próprio render, antes da resposta.
  if (seen.search !== search || seen.tick !== tick) {
    setSeen({ search, tick });
    setPhase('loading');
  }

  const load = useCallback(async (cursor: string | null) => {
    if (!service) return { kind: 'unavailable' as const };
    return service.listEligibleCylinders(organizationId, { search, cursor, limit: PAGE_SIZE });
  }, [service, organizationId, search]);

  useEffect(() => {
    let active = true;
    void load(null).then((outcome) => {
      if (!active) return;
      if (outcome.kind === 'success') { setItems(outcome.value.items); setNext(outcome.value.next); setPhase('ready'); }
      else setPhase(outcome.kind === 'offline' ? 'offline' : 'error');
    });
    return () => { active = false; };
  }, [load, tick]);

  const loadMore = async (): Promise<void> => {
    if (next === null || loadingMore) return;
    setLoadingMore(true);
    const outcome = await load(next);
    setLoadingMore(false);
    if (outcome.kind === 'success') { setItems((current) => [...current, ...outcome.value.items]); setNext(outcome.value.next); }
    else setPhase(outcome.kind === 'offline' ? 'offline' : 'error');
  };

  const visible = items.filter((item) => !excludedIds.has(item.id));
  const full = remaining !== null && remaining <= 0;

  return (
    <div className="flex flex-col gap-4 rounded-card border border-borda-suave bg-cinza-gelo p-4">
      <form role="search" noValidate onSubmit={(event) => { event.preventDefault(); setSearch(draft); }} className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
        <TextField wrapperClassName="tablet:flex-1" label="Buscar cilindro" name="cylinder-search" value={draft} onChange={(event) => setDraft(event.target.value)}
          maxLength={200} autoComplete="off" help="Número de série ou identificador." />
        <Button type="submit" variant="secundario" className="tablet:mb-6">Buscar</Button>
      </form>

      {remaining !== null && <p className="text-corpo font-semibold text-grafite">{full ? 'O veículo está cheio.' : `Cabem mais ${remaining} ${remaining === 1 ? 'cilindro' : 'cilindros'} no veículo.`}</p>}

      {phase === 'loading' && <p aria-busy="true" className="text-corpo text-grafite">Carregando cilindros…</p>}
      {phase === 'offline' && <Alert variant="informacao">Sem conexão. A busca de cilindros exige conexão.</Alert>}
      {phase === 'error' && (
        <Alert variant="erro">
          <p>Não foi possível carregar os cilindros agora.</p>
          <Button variant="secundario" className="mt-2" onClick={() => setTick((current) => current + 1)}>Tentar de novo</Button>
        </Alert>
      )}
      {phase === 'ready' && visible.length === 0 && (
        <p className="text-corpo">{search ? 'Nenhum cilindro elegível corresponde à busca.' : 'Nenhum cilindro elegível disponível. Eles precisam estar ativos, em estoque, com teste em dia e sem reserva.'}</p>
      )}
      {phase === 'ready' && visible.length > 0 && (
        <ul role="list" aria-label="Cilindros elegíveis" className="flex flex-col gap-2">
          {visible.map((cylinder) => (
            <li key={cylinder.id} className="flex flex-wrap items-center justify-between gap-2 rounded-controle border border-borda-suave bg-branco p-2">
              <span className="min-w-0 break-words text-corpo">
                <span className="font-semibold text-navy">{cylinder.serialNumber}</span>
                {` · ${cylinder.gas} ${cylinder.capacityValue} ${cylinder.capacityUnit} · Teste ${HYDROSTATIC_LABELS[cylinder.hydroStatus].toLowerCase()}`}
              </span>
              <Button
                variant="secundario" disabled={disabled || full} aria-label={`Adicionar ${cylinder.serialNumber}`}
                onClick={() => { onAdd(cylinder); onAnnounce(`Cilindro ${cylinder.serialNumber} adicionado à parada.`); }}
              >
                Adicionar
              </Button>
            </li>
          ))}
        </ul>
      )}
      {phase === 'ready' && next !== null && <Button variant="secundario" className="self-start" loading={loadingMore} loadingLabel="Carregando…" onClick={() => void loadMore()}>Mostrar mais cilindros</Button>}
    </div>
  );
}
