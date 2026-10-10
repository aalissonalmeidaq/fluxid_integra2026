import { fail, ok, type Json, type Reply } from './mock-registry';
import type { TripMock, TripOperationContext, TripRow } from './mock-trips';
import { listItem } from './mock-trips-plan';

// Histórico e consultas cruzadas do backend simulado (Spec 008, US6): `trip_history`, `trips_of_cylinder` e `trips_of_site`. Reproduz
// specs/008-viagens-paradas-carga/contracts/operacoes-servidor.md; as regras de banco de verdade são provadas no pgTAP.

const EVENT_TYPES = [
  'trip_created', 'trip_updated', 'loading_started', 'loading_reverted', 'item_checked', 'item_unchecked', 'item_removed', 'trip_started', 'stop_arrived',
  'delivery_registered', 'delivery_corrected', 'unlock_registered', 'item_returned', 'trip_completed', 'trip_cancelled',
];

const limitOf = (body: Json): number => Math.min(Math.max(typeof body.limit === 'number' ? body.limit : 25, 1), 100);

function tripHistory({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  if (body.order !== undefined && body.order !== 'asc' && body.order !== 'desc') return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'order', message: 'Ordem desconhecida.' }] });
  if (typeof body.event_type === 'string' && !EVENT_TYPES.includes(body.event_type)) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'event_type', message: 'Tipo de evento desconhecido.' }] });
  const desc = (body.order ?? 'desc') === 'desc';
  let rows = mock.events.filter((event) => event.trip_id === trip.id);
  if (typeof body.event_type === 'string') rows = rows.filter((event) => event.event_type === body.event_type);
  if (typeof body.from === 'string') rows = rows.filter((event) => event.occurred_at.slice(0, 10) >= String(body.from));
  if (typeof body.to === 'string') rows = rows.filter((event) => event.occurred_at.slice(0, 10) <= String(body.to));
  rows = [...rows].sort((a, b) => (desc ? b.sequence - a.sequence : a.sequence - b.sequence));
  if (typeof body.cursor === 'string') rows = rows.filter((event) => (desc ? event.sequence < Number(body.cursor) : event.sequence > Number(body.cursor)));
  const limit = limitOf(body);
  const page = rows.slice(0, limit);
  return ok('LISTED', { events: page.map(({ organization_id: _org, trip_id: _trip, ...event }) => event), next: rows.length > limit ? String(page.at(-1)!.sequence) : null });
}

// Da mais recente para a mais antiga, com o cursor pelo número da viagem.
function paged(rows: { trip: TripRow; extra: Json }[], body: Json, mock: TripMock): Reply {
  const sorted = [...rows].sort((a, b) => b.trip.number - a.trip.number);
  const after = typeof body.cursor === 'string' ? sorted.filter((row) => row.trip.number < Number(body.cursor)) : sorted;
  const limit = limitOf(body);
  const page = after.slice(0, limit);
  return ok('LISTED', { items: page.map((row) => ({ ...listItem(mock, row.trip), ...row.extra })), next: after.length > limit ? String(page.at(-1)!.trip.number) : null });
}

function tripsOfCylinder({ org, body, mock }: TripOperationContext): Reply {
  const cylinder = mock.cylinders.cylinders.find((candidate) => candidate.id === body.cylinder_id && candidate.organization_id === org);
  if (!cylinder) return fail('NOT_FOUND', 404);
  const rows = mock.items.filter((item) => item.cylinder_id === cylinder.id && item.organization_id === org)
    .map((item) => ({ trip: mock.tripOf(org, item.trip_id)!, extra: { item_status: item.item_status, lock_status: item.lock_status } }));
  return paged(rows, body, mock);
}

function tripsOfSite({ org, body, mock }: TripOperationContext): Reply {
  const site = mock.registry.sites.find((candidate) => candidate.id === body.site_id && candidate.organization_id === org);
  if (!site) return fail('NOT_FOUND', 404);
  const byTrip = new Map<string, { trip: TripRow; extra: Json }>();
  for (const stop of mock.stops.filter((candidate) => candidate.site_id === site.id && candidate.organization_id === org && candidate.status !== 'removed')) {
    if (!byTrip.has(stop.trip_id)) byTrip.set(stop.trip_id, { trip: mock.tripOf(org, stop.trip_id)!, extra: { stop_status: stop.status } });
  }
  return paged([...byTrip.values()], body, mock);
}

export function registerQueryOperations(mock: TripMock): void {
  mock.register('trip_history', { kind: 'query', permission: 'trip.history', run: tripHistory });
  mock.register('trips_of_cylinder', { kind: 'query', permission: ['trip.read', 'cylinder.read'], run: tripsOfCylinder });
  mock.register('trips_of_site', { kind: 'query', permission: ['trip.read', 'customer.read'], run: tripsOfSite });
}
