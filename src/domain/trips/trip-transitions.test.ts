import { describe, expect, it } from 'vitest';
import { canTransitionItem, canTransitionStop, canTransitionTrip, itemTargets, nextLockStatus, tripTargets } from './trip-transitions';
import { ITEM_STATUSES, LOCK_STATUSES, STOP_STATUSES, TRIP_STATUSES, type ItemStatus, type StopStatus, type TripStatus } from './trip-vocabulary';

// Tabela de verdade completa (RF-007, RF-008, RF-009, CA-003): todo par (de, para) é conferido contra a lista explícita de válidos.
const pairs = <T extends string>(values: readonly T[]): [T, T][] => values.flatMap((from) => values.map((to): [T, T] => [from, to]));

const TRIP_VALID = new Set(['planned>loading', 'loading>planned', 'loading>in_progress', 'in_progress>completed', 'planned>cancelled', 'loading>cancelled', 'in_progress>cancelled']);
const STOP_VALID = new Set(['pending>on_site', 'pending>removed', 'on_site>delivered', 'on_site>with_divergence', 'with_divergence>delivered']);
const ITEM_VALID = new Set([
  'planned>checked', 'checked>planned', 'planned>removed', 'checked>removed', 'planned>released', 'checked>released', 'checked>in_transit',
  'in_transit>delivered', 'in_transit>not_delivered', 'not_delivered>delivered', 'in_transit>returned', 'not_delivered>returned',
]);

describe('viagem', () => {
  it.each(pairs<TripStatus>(TRIP_STATUSES))('%s → %s', (from, to) => {
    expect(canTransitionTrip(from, to)).toBe(TRIP_VALID.has(`${from}>${to}`));
  });

  it('concluída e cancelada são finais', () => {
    expect(tripTargets('completed')).toEqual([]);
    expect(tripTargets('cancelled')).toEqual([]);
  });

  it('a viagem em andamento só vai a concluída ou cancelada', () => {
    expect([...tripTargets('in_progress')]).toEqual(['completed', 'cancelled']);
  });
});

describe('parada', () => {
  it.each(pairs<StopStatus>(STOP_STATUSES))('%s → %s', (from, to) => {
    expect(canTransitionStop(from, to)).toBe(STOP_VALID.has(`${from}>${to}`));
  });

  it('parada fechada não aceita nova chegada', () => {
    expect(canTransitionStop('delivered', 'on_site')).toBe(false);
    expect(canTransitionStop('with_divergence', 'on_site')).toBe(false);
  });

  it('a divergência só se resolve por entrega', () => {
    expect(canTransitionStop('with_divergence', 'delivered')).toBe(true);
  });
});

describe('item de carga', () => {
  it.each(pairs<ItemStatus>(ITEM_STATUSES))('%s → %s', (from, to) => {
    expect(canTransitionItem(from, to)).toBe(ITEM_VALID.has(`${from}>${to}`));
  });

  it('removido, liberado, devolvido e entregue são finais', () => {
    for (const status of ['removed', 'released', 'returned', 'delivered'] as const) expect(itemTargets(status)).toEqual([]);
  });

  it('não entregue pode ser entregue por correção ou devolvido ao estoque', () => {
    expect([...itemTargets('not_delivered')].sort()).toEqual(['delivered', 'returned']);
  });
});

describe('bloqueio', () => {
  it('bloqueia no início e desbloqueia depois, nunca volta', () => {
    expect(nextLockStatus('none', 'start')).toBe('locked');
    expect(nextLockStatus('locked', 'unlock')).toBe('unlocked');
  });

  it.each(LOCK_STATUSES.flatMap((status) => (['start', 'unlock'] as const).map((action) => [status, action] as const)))('%s + %s', (status, action) => {
    const valid = (status === 'none' && action === 'start') || (status === 'locked' && action === 'unlock');
    expect(nextLockStatus(status, action) !== null).toBe(valid);
  });

  it('desbloqueado nunca volta a bloqueado', () => {
    expect(nextLockStatus('unlocked', 'start')).toBeNull();
    expect(nextLockStatus('unlocked', 'unlock')).toBeNull();
  });
});
