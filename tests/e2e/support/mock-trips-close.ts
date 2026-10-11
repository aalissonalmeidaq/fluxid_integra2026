import { fail, ok, type Reply } from './mock-registry';
import type { TripMock, TripOperationContext } from './mock-trips';

// Encerramento do backend simulado (Spec 008, US5): concluir, cancelar e devolver ao estoque. Reproduz
// specs/008-viagens-paradas-carga/contracts/operacoes-servidor.md; o banco de verdade é provado no pgTAP.

const reasonOf = (value: unknown): string | null => (typeof value === 'string' && value.trim().length >= 5 && value.trim().length <= 500 ? value.trim() : null);

function completeTrip({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  if (trip.status === 'completed' || trip.status === 'cancelled') return fail('TRIP_CLOSED', 409);
  if (trip.status !== 'in_progress') return fail('INVALID_TRANSITION', 409, { from: trip.status, to: 'completed' });
  if (trip.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  const items = mock.itemsOf(trip.id);
  const open = mock.stopsOf(trip.id).filter((stop) => stop.status !== 'removed' && (stop.status === 'pending' || stop.status === 'on_site'
    || items.some((item) => item.stop_id === stop.id && ['in_transit', 'not_delivered'].includes(item.item_status)))).map((stop) => stop.id);
  if (open.length > 0) return fail('STOPS_OPEN', 409, { stop_ids: open });
  trip.status = 'completed';
  trip.completed_at = mock.now().toISOString();
  trip.version += 1;
  mock.appendEvent(trip, 'trip_completed', null, {
    number: trip.number, delivered: items.filter((item) => item.item_status === 'delivered').length, returned: items.filter((item) => item.item_status === 'returned').length,
  });
  return ok('COMPLETED', { version: trip.version });
}

function cancelTrip({ org, body, can, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  if (trip.status === 'completed' || trip.status === 'cancelled') return fail('TRIP_CLOSED', 409);
  if (trip.status === 'in_progress' && !can(org, 'trip.exception')) return fail('ACCESS_DENIED', 403);
  if (trip.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  const reason = reasonOf(body.justification);
  if (reason === null) return fail('JUSTIFICATION_REQUIRED', 400);
  let released = 0;
  for (const item of mock.itemsOf(trip.id)) {
    if (item.item_status === 'planned' || item.item_status === 'checked') { item.item_status = 'released'; released += 1; }
  }
  const inTransit = mock.itemsOf(trip.id).filter((item) => ['in_transit', 'not_delivered'].includes(item.item_status)).length;
  trip.status = 'cancelled';
  trip.cancel_reason = reason;
  trip.cancelled_at = mock.now().toISOString();
  trip.version += 1;
  mock.appendEvent(trip, 'trip_cancelled', reason, { released, in_transit: inTransit });
  return ok('CANCELLED', { version: trip.version, released, in_transit: inTransit });
}

function returnItem({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  if (trip.status === 'completed') return fail('TRIP_CLOSED', 409);
  if (trip.status === 'planned' || trip.status === 'loading') return fail('INVALID_TRANSITION', 409, { from: trip.status, to: 'returned' });
  const item = mock.itemsOf(trip.id).find((candidate) => candidate.id === body.item_id);
  if (!item) return fail('NOT_FOUND', 404, { entity: 'item' });
  if (!['in_transit', 'not_delivered'].includes(item.item_status)) return fail('INVALID_TRANSITION', 409, { from: item.item_status, to: 'returned' });
  const reason = reasonOf(body.justification);
  if (reason === null) return fail('JUSTIFICATION_REQUIRED', 400);
  item.item_status = 'returned';
  item.divergence_reason = item.divergence_reason ?? reason;
  mock.cylinders.cylinders.find((candidate) => candidate.id === item.cylinder_id)!.stock_status = 'in_stock';
  const stop = mock.stopsOf(trip.id).find((candidate) => candidate.id === item.stop_id)!;
  if ((stop.status === 'pending' || stop.status === 'on_site') && !mock.itemsOf(trip.id).some((other) => other.stop_id === stop.id && other.item_status === 'in_transit')) {
    stop.status = 'with_divergence';
    stop.arrived_at = stop.arrived_at ?? mock.now().toISOString();
    stop.closed_at = mock.now().toISOString();
  }
  mock.appendEvent(trip, 'item_returned', reason, { item_id: item.id });
  return ok('RETURNED');
}

export function registerCloseOperations(mock: TripMock): void {
  mock.register('complete_trip', { kind: 'manage', permission: 'trip.operate', run: completeTrip });
  mock.register('cancel_trip', { kind: 'manage', permission: 'trip.cancel', run: cancelTrip });
  mock.register('return_item', { kind: 'manage', permission: ['trip.operate', 'trip.exception'], run: returnItem });
}
