import type { ItemStatus, LockStatus, StopStatus, TripStatus } from './trip-vocabulary';

// Máquina de estados das viagens (data-model.md, "Transições"). O banco aplica as mesmas regras sob `for update` e recusa qualquer
// outra com INVALID_TRANSITION, inclusive por pedido direto (CA-003); aqui só se evita a ida e volta e se decide o que a tela oferece.

const TRIP_MOVES: Record<TripStatus, readonly TripStatus[]> = {
  planned: ['loading', 'cancelled'],
  loading: ['planned', 'in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// `removed` é a parada tirada do planejamento numa edição (só enquanto pendente).
const STOP_MOVES: Record<StopStatus, readonly StopStatus[]> = {
  pending: ['on_site', 'removed'],
  on_site: ['delivered', 'with_divergence'],
  delivered: [],
  with_divergence: ['delivered'],
  removed: [],
};

const ITEM_MOVES: Record<ItemStatus, readonly ItemStatus[]> = {
  planned: ['checked', 'removed', 'released'],
  checked: ['planned', 'removed', 'released', 'in_transit'],
  in_transit: ['delivered', 'not_delivered', 'returned'],
  not_delivered: ['delivered', 'returned'],
  delivered: [],
  removed: [],
  released: [],
  returned: [],
};

export const canTransitionTrip = (from: TripStatus, to: TripStatus): boolean => TRIP_MOVES[from].includes(to);
export const canTransitionStop = (from: StopStatus, to: StopStatus): boolean => STOP_MOVES[from].includes(to);
export const canTransitionItem = (from: ItemStatus, to: ItemStatus): boolean => ITEM_MOVES[from].includes(to);

export const tripTargets = (from: TripStatus): readonly TripStatus[] => TRIP_MOVES[from];
export const itemTargets = (from: ItemStatus): readonly ItemStatus[] => ITEM_MOVES[from];

// Bloqueio (lógico): `none → locked` no início da viagem e `locked → unlocked` no desbloqueio; nunca volta. Devolve nulo quando a ação
// não existe a partir da situação atual.
export type LockAction = 'start' | 'unlock';
export function nextLockStatus(current: LockStatus, action: LockAction): LockStatus | null {
  if (action === 'start') return current === 'none' ? 'locked' : null;
  return current === 'locked' ? 'unlocked' : null;
}
