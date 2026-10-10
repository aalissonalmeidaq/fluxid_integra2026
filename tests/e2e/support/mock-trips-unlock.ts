import { fail, ok, type Reply } from './mock-registry';
import { TRIP_ACTOR_NAME, type TripMock, type TripOperationContext } from './mock-trips';

// Desbloqueio do backend simulado (Spec 008, US4). Reproduz specs/008-viagens-paradas-carga/contracts/operacoes-servidor.md: o normal
// (item entregue) exige trip.unlock; o excepcional (item ainda não entregue) exige também trip.exception, segundo fator (`aal2`) e
// justificativa. O desbloqueio não muda a entrega nem o cilindro, e não existe operação de refazer o bloqueio.

function registerUnlock({ org, body, can, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  if (trip.status === 'planned' || trip.status === 'loading') return fail('INVALID_TRANSITION', 409, { from: trip.status, to: 'unlocked' });
  const item = mock.itemsOf(trip.id).find((candidate) => candidate.id === body.item_id);
  if (!item) return fail('NOT_FOUND', 404, { entity: 'item' });
  if (item.lock_status !== 'locked') return fail('INVALID_TRANSITION', 409, { from: item.lock_status, to: 'unlocked' });
  const justification = typeof body.justification === 'string' && body.justification.trim() !== '' ? body.justification.trim() : null;
  const exceptional = item.item_status !== 'delivered';
  if (exceptional) {
    if (!can(org, 'trip.exception')) return fail('ACCESS_DENIED', 403);
    if (mock.aal !== 'aal2') return fail('MFA_REQUIRED', 403);
    if (justification === null || justification.length < 5 || justification.length > 500) return fail('JUSTIFICATION_REQUIRED', 400);
  } else if (justification !== null && justification.length > 500) {
    return fail('JUSTIFICATION_REQUIRED', 400);
  }
  item.lock_status = 'unlocked';
  mock.unlocks.push({ id: mock.nextId('9d'), organization_id: org, item_id: item.id, exceptional, justification, aal: mock.aal, actor_name: TRIP_ACTOR_NAME, occurred_at: mock.now().toISOString() });
  mock.appendEvent(trip, 'unlock_registered', justification, { item_id: item.id, exceptional });
  return ok('UNLOCKED', { exceptional });
}

export function registerUnlockOperations(mock: TripMock): void {
  mock.register('register_unlock', { kind: 'manage', permission: 'trip.unlock', run: registerUnlock });
}
