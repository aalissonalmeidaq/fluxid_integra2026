import { validityStatus } from '../../../src/domain/shared/validity-status';
import { hydroStatus, type CylinderMock } from './mock-cylinders';
import { fail, ok, ORG_A, type Json, type RegistryMock, type Reply } from './mock-registry';
import { registerCloseOperations } from './mock-trips-close';
import { registerDeliveryOperations } from './mock-trips-delivery';
import { registerLoadingOperations } from './mock-trips-loading';
import { registerQueryOperations } from './mock-trips-query';
import { registerUnlockOperations } from './mock-trips-unlock';
import { TripMock, TRIP_ACTOR_NAME, type TripItemRow, type TripOperationContext, type TripRow, type TripStopRow } from './mock-trips';

// Planejamento e consulta de viagens do backend simulado (Spec 008, US1). Reproduz o contrato de
// specs/008-viagens-paradas-carga/contracts/operacoes-servidor.md: reserva única de cilindro, elegibilidade, capacidade, cadastros
// indisponíveis, versão otimista e idempotência (esta pelo `handle` de TripMock). As regras de banco de verdade são provadas nas
// suítes pgTAP e `.live`.

type Cylinder = CylinderMock['cylinders'][number];
const OPEN_ITEM = ['planned', 'checked', 'in_transit', 'not_delivered'];
const invalid = (field: string, message: string): Reply => fail('VALIDATION_FAILED', 400, { fields: [{ field, message }] });
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const lower = (value: unknown): string => String(value ?? '').toLowerCase();

interface PlanStop { id: string | null; site_id: string; cylinder_ids: string[] }

function readStops(value: unknown): PlanStop[] | Reply {
  if (!Array.isArray(value) || value.length === 0) return invalid('stops', 'Inclua pelo menos uma parada.');
  if (value.length > 30) return invalid('stops', 'Uma viagem tem no máximo 30 paradas.');
  const stops: PlanStop[] = [];
  for (const entry of value as Json[]) {
    const ids = Array.isArray(entry.cylinder_ids) ? (entry.cylinder_ids as string[]) : [];
    if (ids.length === 0) return invalid('stops', 'Cada parada precisa de pelo menos um cilindro.');
    if (ids.length > 200) return invalid('stops', 'Cada parada aceita no máximo 200 cilindros.');
    stops.push({ id: typeof entry.id === 'string' ? entry.id : null, site_id: String(entry.site_id), cylinder_ids: ids });
  }
  const all = stops.flatMap((stop) => stop.cylinder_ids);
  if (new Set(all).size !== all.length) return invalid('cylinders', 'O mesmo cilindro aparece mais de uma vez na viagem.');
  return stops;
}
const isReply = (value: unknown): value is Reply => typeof value === 'object' && value !== null && 'status' in value && 'json' in value;

function refusal(cylinder: Cylinder, today: string): string | null {
  if (cylinder.status !== 'active') return 'inactive';
  if (cylinder.stock_status !== 'in_stock') return 'out_of_stock';
  const hydro = hydroStatus(cylinder.hydro_last_result, cylinder.hydro_next_due_on);
  void today;
  return hydro === 'reprovado' ? 'hydro_rejected' : hydro === 'vencido' ? 'hydro_expired' : hydro === 'sem_teste' ? 'hydro_missing' : null;
}

function openItem(mock: TripMock, cylinderId: string, exceptTrip?: string): { item: TripItemRow; trip: TripRow } | null {
  const item = mock.items.find((candidate) => candidate.cylinder_id === cylinderId && OPEN_ITEM.includes(candidate.item_status) && candidate.trip_id !== exceptTrip);
  const trip = item ? mock.trips.find((candidate) => candidate.id === item.trip_id) : undefined;
  return item && trip ? { item, trip } : null;
}

function checkCadastros(mock: TripMock, org: string, vehicleId: unknown, driverId: unknown, stops: PlanStop[], changed: { vehicle: boolean; driver: boolean; sites: Set<string> }): Reply | null {
  const registry: RegistryMock = mock.registry;
  if (changed.vehicle) {
    const vehicle = registry.vehicles.find((candidate) => candidate.id === vehicleId && candidate.organization_id === org);
    if (!vehicle) return fail('NOT_FOUND', 404, { entity: 'vehicle' });
    if (vehicle.status !== 'available') return fail('PARENT_INACTIVE', 409, { entity: 'vehicle', entity_id: vehicle.id });
  }
  if (changed.driver) {
    const driver = registry.drivers.find((candidate) => candidate.id === driverId && candidate.organization_id === org);
    if (!driver) return fail('NOT_FOUND', 404, { entity: 'driver' });
    if (driver.status !== 'active') return fail('PARENT_INACTIVE', 409, { entity: 'driver', entity_id: driver.id });
  }
  for (const stop of stops) {
    if (!changed.sites.has(stop.site_id)) continue;
    const site = registry.sites.find((candidate) => candidate.id === stop.site_id && candidate.organization_id === org);
    if (!site) return fail('NOT_FOUND', 404, { entity: 'site' });
    const customer = registry.customers.find((candidate) => candidate.id === site.customer_id);
    if (site.status !== 'active') return fail('PARENT_INACTIVE', 409, { entity: 'site', entity_id: site.id });
    if (customer && customer.status !== 'active') return fail('PARENT_INACTIVE', 409, { entity: 'customer', entity_id: customer.id });
  }
  return null;
}

function checkNewCylinders(mock: TripMock, org: string, ids: string[], exceptTrip?: string): Reply | null {
  const found = ids.map((id) => mock.cylinders.cylinders.find((cylinder) => cylinder.id === id && cylinder.organization_id === org));
  if (found.some((cylinder) => !cylinder)) return fail('NOT_FOUND', 404, { entity: 'cylinder' });
  for (const cylinder of [...(found as Cylinder[])].sort((a, b) => a.id.localeCompare(b.id))) {
    const reserved = openItem(mock, cylinder.id, exceptTrip);
    if (reserved) return fail('CYLINDER_RESERVED', 409, { cylinder_id: cylinder.id, trip_id: reserved.trip.id, trip_number: reserved.trip.number });
    const reason = refusal(cylinder, mock.today());
    if (reason) return fail('CYLINDER_NOT_ELIGIBLE', 409, { cylinder_id: cylinder.id, reason });
  }
  return null;
}

function validateHeader(mock: TripMock, body: Json, creating: boolean): Reply | null {
  const date = body.planned_date;
  if (typeof date !== 'string') return invalid('planned_date', 'Informe a data prevista.');
  if (creating && date < mock.today()) return invalid('planned_date', 'Escolha hoje ou uma data futura.');
  if (typeof body.notes === 'string' && body.notes.length > 500) return invalid('notes', 'Use até 500 caracteres nas observações.');
  return null;
}

function createTrip({ org, body, mock }: TripOperationContext): Reply {
  const header = validateHeader(mock, body, true);
  if (header) return header;
  const stops = readStops(body.stops);
  if (isReply(stops)) return stops;
  const cadastros = checkCadastros(mock, org, body.vehicle_id, body.driver_id, stops, { vehicle: true, driver: true, sites: new Set(stops.map((stop) => stop.site_id)) });
  if (cadastros) return cadastros;
  const ids = stops.flatMap((stop) => stop.cylinder_ids);
  const vehicle = mock.registry.vehicles.find((candidate) => candidate.id === body.vehicle_id)!;
  if (ids.length > (vehicle.capacity_cylinders as number)) return fail('CAPACITY_EXCEEDED', 409, { capacity: vehicle.capacity_cylinders, requested: ids.length });
  const cylinders = checkNewCylinders(mock, org, ids);
  if (cylinders) return cylinders;

  const id = mock.nextId('99');
  const number = mock.nextNumber(org);
  const now = mock.now().toISOString();
  const trip: TripRow = {
    id, organization_id: org, number, planned_date: String(body.planned_date), vehicle_id: String(body.vehicle_id), driver_id: String(body.driver_id), status: 'planned',
    notes: asText(body.notes), cancel_reason: null, version: 1, created_at: now, created_by_name: TRIP_ACTOR_NAME, started_at: null, completed_at: null, cancelled_at: null,
  };
  mock.trips.push(trip);
  stops.forEach((stop, index) => {
    const stopId = mock.nextId('9a');
    mock.stops.push({ id: stopId, organization_id: org, trip_id: id, site_id: stop.site_id, position: index + 1, status: 'pending', arrived_at: null, out_of_order: false, closed_at: null });
    for (const cylinderId of stop.cylinder_ids) {
      mock.items.push({ id: mock.nextId('9b'), organization_id: org, trip_id: id, stop_id: stopId, cylinder_id: cylinderId, item_status: 'planned', lock_status: 'none', checked_at: null, checked_by_name: null, divergence_reason: null });
    }
  });
  mock.appendEvent(trip, 'trip_created', null, { number, stops: stops.length, cylinders: ids.length });
  return ok('CREATED', { trip_id: id, number, version: 1 });
}

function updateTrip({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  if (trip.status === 'completed' || trip.status === 'cancelled') return fail('TRIP_CLOSED', 409);
  if (trip.status === 'in_progress') return fail('INVALID_TRANSITION', 409, { from: 'in_progress', to: 'planned' });
  if (trip.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  const header = validateHeader(mock, body, false);
  if (header) return header;
  const stops = readStops(body.stops);
  if (isReply(stops)) return stops;

  const existing = mock.stopsOf(trip.id).filter((stop) => stop.status !== 'removed');
  for (const stop of stops) if (stop.id !== null && !existing.some((candidate) => candidate.id === stop.id)) return fail('NOT_FOUND', 404, { entity: 'stop' });
  const changedSites = new Set(stops.filter((stop) => stop.id === null || existing.find((candidate) => candidate.id === stop.id)?.site_id !== stop.site_id).map((stop) => stop.site_id));
  const cadastros = checkCadastros(mock, org, body.vehicle_id, body.driver_id, stops, { vehicle: body.vehicle_id !== trip.vehicle_id, driver: body.driver_id !== trip.driver_id, sites: changedSites });
  if (cadastros) return cadastros;
  const vehicle = mock.registry.vehicles.find((candidate) => candidate.id === body.vehicle_id && candidate.organization_id === org);
  if (!vehicle) return fail('NOT_FOUND', 404, { entity: 'vehicle' });
  const ids = stops.flatMap((stop) => stop.cylinder_ids);
  if (ids.length > (vehicle.capacity_cylinders as number)) return fail('CAPACITY_EXCEEDED', 409, { capacity: vehicle.capacity_cylinders, requested: ids.length });

  const items = mock.itemsOf(trip.id);
  const current = items.filter((item) => item.item_status === 'planned' || item.item_status === 'checked');
  if (current.some((item) => item.item_status === 'checked' && !ids.includes(item.cylinder_id))) return invalid('cylinders', 'Cilindro já conferido só sai da viagem pela retirada com exceção.');
  if (items.some((item) => item.item_status === 'removed' && ids.includes(item.cylinder_id))) return invalid('cylinders', 'Cilindro retirado desta viagem não volta a ela.');
  const added = ids.filter((id) => !current.some((item) => item.cylinder_id === id));
  const cylinders = checkNewCylinders(mock, org, added, trip.id);
  if (cylinders) return cylinders;

  trip.planned_date = String(body.planned_date);
  trip.vehicle_id = String(body.vehicle_id);
  trip.driver_id = String(body.driver_id);
  trip.notes = asText(body.notes);
  trip.version += 1;
  const kept: string[] = [];
  stops.forEach((stop, index) => {
    let row: TripStopRow | undefined = stop.id ? existing.find((candidate) => candidate.id === stop.id) : undefined;
    if (row) { row.site_id = stop.site_id; row.position = index + 1; } else {
      row = { id: mock.nextId('9a'), organization_id: org, trip_id: trip.id, site_id: stop.site_id, position: index + 1, status: 'pending', arrived_at: null, out_of_order: false, closed_at: null };
      mock.stops.push(row);
    }
    kept.push(row.id);
    for (const cylinderId of stop.cylinder_ids) {
      const item = items.find((candidate) => candidate.cylinder_id === cylinderId);
      if (!item) mock.items.push({ id: mock.nextId('9b'), organization_id: org, trip_id: trip.id, stop_id: row.id, cylinder_id: cylinderId, item_status: 'planned', lock_status: 'none', checked_at: null, checked_by_name: null, divergence_reason: null });
      else if (item.item_status === 'released') { item.item_status = 'planned'; item.stop_id = row.id; item.divergence_reason = null; item.checked_at = null; } else item.stop_id = row.id;
    }
  });
  for (const item of items) if (item.item_status === 'planned' && !ids.includes(item.cylinder_id)) item.item_status = 'released';
  for (const stop of existing) if (!kept.includes(stop.id)) { stop.status = 'removed'; stop.position = null; }
  mock.appendEvent(trip, 'trip_updated', null, { stops: stops.length, cylinders: ids.length });
  return ok('UPDATED', { version: trip.version });
}

function siteView(mock: TripMock, siteId: string): Json {
  const site = mock.registry.sites.find((candidate) => candidate.id === siteId)!;
  const customer = mock.registry.customers.find((candidate) => candidate.id === site.customer_id)!;
  const anonymized = customer.anonymized_at !== null && customer.anonymized_at !== undefined;
  return {
    id: site.id, name: site.name, city: site.city, state: site.state, customer_id: customer.id,
    customer_name: anonymized ? 'Cliente anonimizado' : (customer.trade_name ?? customer.legal_name),
  };
}

function custodyOf(mock: TripMock, item: TripItemRow): string {
  if (item.item_status === 'in_transit' || item.item_status === 'not_delivered') return 'in_transit';
  if (item.item_status === 'delivered') return 'at_customer';
  void mock;
  return 'in_organization';
}

function cylinderView(mock: TripMock, item: TripItemRow): Json {
  const cylinder = mock.cylinders.cylinders.find((candidate) => candidate.id === item.cylinder_id)!;
  const type = mock.cylinders.types.find((candidate) => candidate.id === cylinder.type_id)!;
  return {
    id: cylinder.id, serial_number: cylinder.serial_number, gas: type.gas, capacity_value: type.capacity_value, capacity_unit: type.capacity_unit, status: cylinder.status,
    stock_status: item.item_status === 'in_transit' || item.item_status === 'delivered' || item.item_status === 'not_delivered' ? 'out_of_stock' : cylinder.stock_status,
    custody_status: custodyOf(mock, item), hydro_status: hydroStatus(cylinder.hydro_last_result, cylinder.hydro_next_due_on),
  };
}

export function itemView(mock: TripMock, item: TripItemRow): Json {
  return {
    id: item.id, stop_id: item.stop_id, item_status: item.item_status, lock_status: item.lock_status, checked_at: item.checked_at, checked_by_name: item.checked_by_name,
    divergence_reason: item.divergence_reason, cylinder: cylinderView(mock, item),
  };
}

export function stopView(mock: TripMock, stop: TripStopRow): Json {
  return { id: stop.id, position: stop.position, status: stop.status, arrived_at: stop.arrived_at, out_of_order: stop.out_of_order, closed_at: stop.closed_at, site: siteView(mock, stop.site_id) };
}

const isOverdue = (mock: TripMock, trip: TripRow): boolean => (trip.status === 'planned' || trip.status === 'loading') && trip.planned_date < mock.today();

function getTrip({ org, body, can, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const vehicle = mock.registry.vehicles.find((candidate) => candidate.id === trip.vehicle_id)!;
  const driver = mock.registry.drivers.find((candidate) => candidate.id === trip.driver_id)!;
  const today = mock.today();
  const licensing = validityStatus((vehicle.licensing_due_on as string | null) ?? null, today);
  const cnh = validityStatus(driver.cnh_valid_until as string, today);
  const warnings: string[] = [];
  if (trip.status === 'planned' || trip.status === 'loading') {
    if (licensing === 'vencido') warnings.push('licensing_expired'); else if (licensing === 'a_vencer') warnings.push('licensing_expiring');
    if (cnh === 'vencido') warnings.push('cnh_expired'); else if (cnh === 'a_vencer') warnings.push('cnh_expiring');
    if (vehicle.status !== 'available') warnings.push('vehicle_unavailable');
    if (driver.status !== 'active') warnings.push('driver_inactive');
  }
  const stops = mock.stopsOf(trip.id).filter((stop) => stop.status !== 'removed').sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const stopIds = new Set(stops.map((stop) => stop.id));
  const recipient = can(org, 'trip.recipient');
  return ok('FOUND', {
    overdue: isOverdue(mock, trip),
    trip: {
      id: trip.id, number: trip.number, planned_date: trip.planned_date, status: trip.status, notes: trip.notes, cancel_reason: trip.cancel_reason, version: trip.version,
      created_at: trip.created_at, created_by_name: trip.created_by_name, started_at: trip.started_at, completed_at: trip.completed_at, cancelled_at: trip.cancelled_at,
    },
    vehicle: { id: vehicle.id, plate: vehicle.plate, capacity_cylinders: vehicle.capacity_cylinders, status: vehicle.status, licensing_due_on: vehicle.licensing_due_on ?? null, licensing_status: licensing },
    driver: { id: driver.id, full_name: driver.full_name, status: driver.status, cnh_valid_until: driver.cnh_valid_until, cnh_status: cnh },
    stops: stops.map((stop) => stopView(mock, stop)),
    items: mock.itemsOf(trip.id).filter((item) => item.item_status !== 'released' && stopIds.has(item.stop_id)).map((item) => itemView(mock, item)),
    deliveries: mock.deliveries.filter((delivery) => stopIds.has(delivery.stop_id)).map((delivery) => ({
      ...delivery, organization_id: undefined, recipient_name: recipient ? delivery.recipient_name : '(restrito)', recipient_role: recipient ? delivery.recipient_role : '(restrito)',
    })),
    unlocks: mock.unlocks.filter((unlock) => mock.items.some((item) => item.id === unlock.item_id && item.trip_id === trip.id)).map((unlock) => ({ ...unlock, organization_id: undefined })),
    warnings,
  });
}

export function listItem(mock: TripMock, trip: TripRow): Json {
  const vehicle = mock.registry.vehicles.find((candidate) => candidate.id === trip.vehicle_id);
  const driver = mock.registry.drivers.find((candidate) => candidate.id === trip.driver_id);
  const stops = mock.stopsOf(trip.id);
  return {
    id: trip.id, number: trip.number, planned_date: trip.planned_date, status: trip.status, version: trip.version, overdue: isOverdue(mock, trip),
    vehicle: vehicle ? { id: vehicle.id, plate: vehicle.plate } : null, driver: driver ? { id: driver.id, full_name: driver.full_name } : null,
    stops: stops.filter((stop) => stop.status !== 'removed').length,
    cylinders: mock.itemsOf(trip.id).filter((item) => item.item_status !== 'removed' && item.item_status !== 'released').length,
    divergences: stops.filter((stop) => stop.status === 'with_divergence').length + mock.itemsOf(trip.id).filter((item) => item.item_status === 'not_delivered').length,
  };
}

function listTrips({ org, body, mock }: TripOperationContext): Reply {
  const status = typeof body.status === 'string' ? body.status : 'open';
  const search = asText(body.search)?.toLowerCase() ?? null;
  const limit = Math.min(Math.max(typeof body.limit === 'number' ? body.limit : 25, 1), 100);
  const sort = typeof body.sort === 'string' ? body.sort : 'number_desc';
  let rows = mock.trips.filter((trip) => trip.organization_id === org)
    .filter((trip) => status === 'all' || (status === 'open' ? ['planned', 'loading', 'in_progress'].includes(trip.status) : trip.status === status))
    .filter((trip) => typeof body.from !== 'string' || trip.planned_date >= body.from)
    .filter((trip) => typeof body.to !== 'string' || trip.planned_date <= body.to)
    .filter((trip) => typeof body.vehicle_id !== 'string' || trip.vehicle_id === body.vehicle_id)
    .filter((trip) => typeof body.driver_id !== 'string' || trip.driver_id === body.driver_id)
    .filter((trip) => typeof body.customer_id !== 'string' || mock.stopsOf(trip.id).some((stop) => stop.status !== 'removed' && siteView(mock, stop.site_id).customer_id === body.customer_id))
    .filter((trip) => typeof body.custody !== 'string' || mock.itemsOf(trip.id).some((item) => ['in_transit', 'not_delivered', 'delivered'].includes(item.item_status) && mock.custodyOf(item.cylinder_id).status === body.custody));
  if (search !== null) {
    rows = rows.filter((trip) => {
      const vehicle = mock.registry.vehicles.find((candidate) => candidate.id === trip.vehicle_id);
      const driver = mock.registry.drivers.find((candidate) => candidate.id === trip.driver_id);
      const customers = mock.stopsOf(trip.id).filter((stop) => stop.status !== 'removed').map((stop) => String(siteView(mock, stop.site_id).customer_name).toLowerCase());
      return String(trip.number) === search || lower(vehicle?.plate).includes(search.replace(/[- ]/g, '')) || lower(driver?.full_name).includes(search) || customers.some((name) => name.includes(search));
    });
  }
  rows.sort((a, b) => (sort === 'number_asc' ? a.number - b.number : sort === 'date_desc' ? (b.planned_date + String(b.number).padStart(10, '0')).localeCompare(a.planned_date + String(a.number).padStart(10, '0')) : sort === 'date_asc' ? (a.planned_date + String(a.number).padStart(10, '0')).localeCompare(b.planned_date + String(b.number).padStart(10, '0')) : b.number - a.number));
  const offset = typeof body.cursor === 'string' ? Number(body.cursor) : 0;
  const page = rows.slice(offset, offset + limit);
  return ok('LISTED', { items: page.map((trip) => listItem(mock, trip)), total: rows.length, next: offset + limit < rows.length ? String(offset + limit) : null });
}

function tripOptions({ org, body, mock }: TripOperationContext): Reply {
  const search = asText(body.search)?.toLowerCase() ?? null;
  const today = mock.today();
  return ok('LISTED', {
    vehicles: mock.registry.vehicles.filter((v) => v.organization_id === org && v.status === 'available' && (search === null || lower(v.plate).includes(search.replace(/[- ]/g, ''))))
      .sort((a, b) => lower(a.plate).localeCompare(lower(b.plate)))
      .map((v) => ({ id: v.id, plate: v.plate, capacity_cylinders: v.capacity_cylinders, licensing_due_on: v.licensing_due_on ?? null, licensing_status: validityStatus((v.licensing_due_on as string | null) ?? null, today) })),
    drivers: mock.registry.drivers.filter((d) => d.organization_id === org && d.status === 'active' && (search === null || lower(d.full_name).includes(search)))
      .sort((a, b) => lower(a.full_name).localeCompare(lower(b.full_name)))
      .map((d) => ({ id: d.id, full_name: d.full_name, cnh_valid_until: d.cnh_valid_until, cnh_status: validityStatus(d.cnh_valid_until as string, today) })),
    sites: mock.registry.sites.filter((s) => {
      const customer = mock.registry.customers.find((c) => c.id === s.customer_id);
      return s.organization_id === org && s.status === 'active' && customer?.status === 'active';
    }).map((s) => siteView(mock, String(s.id))).filter((s) => search === null || lower(s.name).includes(search) || lower(s.customer_name).includes(search) || lower(s.city).includes(search)),
  });
}

function listEligible({ org, body, mock }: TripOperationContext): Reply {
  const search = asText(body.search)?.toLowerCase() ?? null;
  const limit = Math.min(Math.max(typeof body.limit === 'number' ? body.limit : 25, 1), 100);
  const rows = mock.cylinders.cylinders.filter((c) => c.organization_id === org && refusal(c, mock.today()) === null && openItem(mock, c.id) === null)
    .filter((c) => search === null || lower(c.serial_number).includes(search) || mock.cylinders.identifiers.some((i) => i.cylinder_id === c.id && i.status === 'active' && lower(i.value).includes(search)))
    .sort((a, b) => a.serial_number.localeCompare(b.serial_number));
  const offset = typeof body.cursor === 'string' ? Number(body.cursor) : 0;
  const page = rows.slice(offset, offset + limit);
  return ok('LISTED', {
    items: page.map((c) => {
      const type = mock.cylinders.types.find((candidate) => candidate.id === c.type_id)!;
      return { id: c.id, serial_number: c.serial_number, gas: type.gas, capacity_value: type.capacity_value, capacity_unit: type.capacity_unit, hydro_status: hydroStatus(c.hydro_last_result, c.hydro_next_due_on) };
    }),
    next: offset + limit < rows.length ? String(offset + limit) : null,
  });
}

export function registerPlanOperations(mock: TripMock): void {
  mock.register('create_trip', { kind: 'manage', permission: 'trip.write', run: createTrip });
  mock.register('update_trip', { kind: 'manage', permission: 'trip.write', run: updateTrip });
  mock.register('get_trip', { kind: 'query', permission: 'trip.read', run: getTrip });
  mock.register('list_trips', { kind: 'query', permission: 'trip.read', run: listTrips });
  mock.register('trip_options', { kind: 'query', permission: 'trip.write', run: tripOptions });
  mock.register('list_eligible_cylinders', { kind: 'query', permission: 'trip.write', run: listEligible });
}

// Deixa elegíveis (ativos, em estoque e com teste em dia) os cilindros de CIL-006 em diante do Tenant A: opt-in dos E2E de viagem,
// para não mudar as contagens dos E2E de cilindros.
export function seedEligibleCylinders(mock: TripMock, count = 12): void {
  const today = mock.today();
  const due = new Date(`${today}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 200);
  const next = due.toISOString().slice(0, 10);
  mock.cylinders.cylinders.filter((c) => c.organization_id === ORG_A && c.status === 'active').slice(5, 5 + count).forEach((cylinder) => {
    cylinder.stock_status = 'in_stock';
    cylinder.hydro_last_result = 'approved';
    cylinder.hydro_next_due_on = next;
  });
}

export function createTripMock(registry: RegistryMock, cylinders: CylinderMock): TripMock {
  const mock = new TripMock(registry, cylinders);
  registerPlanOperations(mock);
  registerLoadingOperations(mock);
  registerDeliveryOperations(mock);
  registerUnlockOperations(mock);
  registerCloseOperations(mock);
  registerQueryOperations(mock);
  return mock;
}
