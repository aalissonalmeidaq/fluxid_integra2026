import { validityStatus } from '../../../src/domain/shared/validity-status';
import { hydroStatus } from './mock-cylinders';
import { fail, ok, type Json, type Reply } from './mock-registry';
import { TRIP_ACTOR_NAME, type TripMock, type TripOperationContext, type TripRow } from './mock-trips';

// Carregamento e início de viagens do backend simulado (Spec 008, US2): conferência manual, retirada com exceção e início com
// revalidação. Reproduz specs/008-viagens-paradas-carga/contracts/operacoes-servidor.md; o banco de verdade é provado no pgTAP.

const COUNTED = ['planned', 'checked'];

function expectState(trip: TripRow, from: string, to: string): Reply | null {
  if (trip.status === 'completed' || trip.status === 'cancelled') return fail('TRIP_CLOSED', 409);
  if (trip.status !== from) return fail('INVALID_TRANSITION', 409, { from: trip.status, to });
  return null;
}

function busy(mock: TripMock, trip: TripRow): Reply | null {
  for (const [entity, field] of [['vehicle', 'vehicle_id'], ['driver', 'driver_id']] as const) {
    const other = mock.trips.find((candidate) => candidate.id !== trip.id && candidate.organization_id === trip.organization_id && candidate[field] === trip[field]
      && (candidate.status === 'loading' || candidate.status === 'in_progress'));
    if (other) return fail('RESOURCE_BUSY', 409, { entity, trip_id: other.id, trip_number: other.number });
  }
  return null;
}

function counts(mock: TripMock, trip: TripRow): Json {
  const items = mock.itemsOf(trip.id).filter((item) => COUNTED.includes(item.item_status));
  return { checked: items.filter((item) => item.item_status === 'checked').length, total: items.length };
}

function startLoading({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const state = expectState(trip, 'planned', 'loading');
  if (state) return state;
  if (trip.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  const taken = busy(mock, trip);
  if (taken) return taken;
  trip.status = 'loading';
  trip.version += 1;
  mock.appendEvent(trip, 'loading_started', null, { number: trip.number });
  return ok('LOADING', { version: trip.version });
}

function revertLoading({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const state = expectState(trip, 'loading', 'planned');
  if (state) return state;
  if (trip.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (mock.itemsOf(trip.id).some((item) => !['planned', 'released'].includes(item.item_status))) return fail('INVALID_TRANSITION', 409, { from: 'loading', to: 'planned' });
  trip.status = 'planned';
  trip.version += 1;
  mock.appendEvent(trip, 'loading_reverted', null, {});
  return ok('REVERTED', { version: trip.version });
}

function toggle(from: 'planned' | 'checked', to: 'checked' | 'planned', code: string, eventType: string) {
  return ({ org, body, mock }: TripOperationContext): Reply => {
    const trip = mock.tripOf(org, body.trip_id);
    if (!trip) return fail('NOT_FOUND', 404);
    const state = expectState(trip, 'loading', 'loading');
    if (state) return state;
    const item = mock.itemsOf(trip.id).find((candidate) => candidate.id === body.item_id);
    if (!item) return fail('NOT_FOUND', 404, { entity: 'item' });
    if (item.item_status !== from) return fail('INVALID_TRANSITION', 409, { from: item.item_status, to });
    item.item_status = to;
    item.checked_at = to === 'checked' ? mock.now().toISOString() : null;
    item.checked_by_name = to === 'checked' ? TRIP_ACTOR_NAME : null;
    mock.appendEvent(trip, eventType, null, { item_id: item.id });
    return ok(code, counts(mock, trip));
  };
}

function removeItem({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const state = expectState(trip, 'loading', 'loading');
  if (state) return state;
  const item = mock.itemsOf(trip.id).find((candidate) => candidate.id === body.item_id);
  if (!item) return fail('NOT_FOUND', 404, { entity: 'item' });
  if (!COUNTED.includes(item.item_status)) return fail('INVALID_TRANSITION', 409, { from: item.item_status, to: 'removed' });
  const reason = typeof body.justification === 'string' ? body.justification.trim() : '';
  if (reason.length < 5 || reason.length > 500) return fail('JUSTIFICATION_REQUIRED', 400);
  item.item_status = 'removed';
  item.divergence_reason = reason;
  mock.appendEvent(trip, 'item_removed', reason, { item_id: item.id });
  return ok('REMOVED');
}

function startTrip({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const state = expectState(trip, 'loading', 'in_progress');
  if (state) return state;
  if (trip.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  const items = mock.itemsOf(trip.id);
  const pending = items.filter((item) => item.item_status === 'planned').map((item) => item.id);
  if (pending.length > 0) return fail('ITEMS_PENDING', 409, { item_ids: pending });
  const shipped = items.filter((item) => item.item_status === 'checked');
  if (shipped.length === 0) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'cylinders', message: 'A viagem não tem cilindros conferidos para levar.' }] });

  const vehicle = mock.registry.vehicles.find((candidate) => candidate.id === trip.vehicle_id)!;
  const driver = mock.registry.drivers.find((candidate) => candidate.id === trip.driver_id)!;
  if (vehicle.status !== 'available') return fail('PARENT_INACTIVE', 409, { entity: 'vehicle', entity_id: vehicle.id });
  if (driver.status !== 'active') return fail('PARENT_INACTIVE', 409, { entity: 'driver', entity_id: driver.id });
  if (validityStatus(driver.cnh_valid_until as string, mock.today()) === 'vencido') return fail('DRIVER_LICENSE_EXPIRED', 409);
  for (const stop of mock.stopsOf(trip.id).filter((candidate) => candidate.status === 'pending')) {
    if (!shipped.some((item) => item.stop_id === stop.id)) continue;
    const site = mock.registry.sites.find((candidate) => candidate.id === stop.site_id)!;
    const customer = mock.registry.customers.find((candidate) => candidate.id === site.customer_id)!;
    const anonymized = customer.anonymized_at !== null && customer.anonymized_at !== undefined;
    if (site.status !== 'active' && !anonymized) return fail('PARENT_INACTIVE', 409, { entity: 'site', entity_id: site.id });
    if (customer.status !== 'active' && !anonymized) return fail('PARENT_INACTIVE', 409, { entity: 'customer', entity_id: customer.id });
  }
  if (shipped.length > (vehicle.capacity_cylinders as number)) return fail('CAPACITY_EXCEEDED', 409, { capacity: vehicle.capacity_cylinders, requested: shipped.length });
  const taken = busy(mock, trip);
  if (taken) return taken;
  for (const item of [...shipped].sort((a, b) => a.cylinder_id.localeCompare(b.cylinder_id))) {
    const cylinder = mock.cylinders.cylinders.find((candidate) => candidate.id === item.cylinder_id)!;
    const hydro = hydroStatus(cylinder.hydro_last_result, cylinder.hydro_next_due_on);
    const why = cylinder.status !== 'active' ? 'inactive' : cylinder.stock_status !== 'in_stock' ? 'out_of_stock'
      : hydro === 'reprovado' ? 'hydro_rejected' : hydro === 'vencido' ? 'hydro_expired' : hydro === 'sem_teste' ? 'hydro_missing' : null;
    if (why) return fail('CYLINDER_NOT_ELIGIBLE', 409, { cylinder_id: cylinder.id, reason: why });
  }

  trip.status = 'in_progress';
  trip.started_at = mock.now().toISOString();
  trip.version += 1;
  for (const item of shipped) {
    item.item_status = 'in_transit';
    item.lock_status = 'locked';
    mock.cylinders.cylinders.find((candidate) => candidate.id === item.cylinder_id)!.stock_status = 'out_of_stock';
  }
  for (const stop of mock.stopsOf(trip.id)) {
    if (stop.status === 'pending' && !shipped.some((item) => item.stop_id === stop.id)) { stop.status = 'removed'; stop.position = null; }
  }
  mock.appendEvent(trip, 'trip_started', null, { number: trip.number, cylinders: shipped.length });
  return ok('STARTED', { version: trip.version });
}

export function registerLoadingOperations(mock: TripMock): void {
  mock.register('start_loading', { kind: 'manage', permission: 'trip.operate', run: startLoading });
  mock.register('revert_loading', { kind: 'manage', permission: 'trip.operate', run: revertLoading });
  mock.register('check_item', { kind: 'manage', permission: 'trip.operate', run: toggle('planned', 'checked', 'CHECKED', 'item_checked') });
  mock.register('uncheck_item', { kind: 'manage', permission: 'trip.operate', run: toggle('checked', 'planned', 'UNCHECKED', 'item_unchecked') });
  mock.register('remove_item', { kind: 'manage', permission: ['trip.operate', 'trip.exception'], run: removeItem });
  mock.register('start_trip', { kind: 'manage', permission: 'trip.operate', run: startTrip });
}
