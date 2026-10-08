import { normalizePlate } from '../../../src/domain/registry/plate';
import { validityStatus } from '../../../src/domain/shared/validity-status';
import { addCivilDays } from '../../../src/domain/shared/civil-date';
import { fail, ok, ORG_A, ORG_B, type Json, type OperationContext, type RegistryMock, type Reply } from './mock-registry';

// Veículos do backend simulado (Spec 007, US4); os motoristas entram na US5. Reproduz o contrato de
// specs/007-clientes-geocercas-frota/contracts/operacoes-servidor.md: placa única por organização, licenciamento calculado, regras
// da situação operacional e versão otimista. As regras de banco de verdade são provadas nas suítes pgTAP.

const TYPES = ['truck', 'van', 'utility', 'other'];
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const lower = (value: unknown): string => String(value ?? '').toLowerCase();
const invalid = (field: string, message: string): Reply => fail('VALIDATION_FAILED', 400, { fields: [{ field, message }] });

const vehiclesOf = (mock: RegistryMock, org: string): Json[] => mock.vehicles.filter((vehicle) => vehicle.organization_id === org);
const vehicleOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => vehiclesOf(mock, org).find((vehicle) => vehicle.id === id);

function view(mock: RegistryMock, vehicle: Json): Json {
  const { organization_id: _org, ...visible } = vehicle;
  void _org;
  return { ...visible, licensing_status: validityStatus((vehicle.licensing_due_on as string | null) ?? null, mock.today()) };
}

function fields(body: Json): Json | Reply {
  const plate = normalizePlate(String(body.plate ?? ''));
  if (plate === null) return invalid('plate', 'Placa inválida.');
  if (typeof body.vehicle_type !== 'string' || !TYPES.includes(body.vehicle_type)) return invalid('vehicle_type', 'Tipo inválido.');
  const detail = asText(body.vehicle_type_detail);
  if (body.vehicle_type === 'other' && detail === null) return invalid('vehicle_type_detail', 'Descreva o tipo.');
  const capacity = body.capacity_cylinders;
  if (typeof capacity !== 'number' || capacity < 1 || capacity > 9999) return invalid('capacity_cylinders', 'Capacidade inválida.');
  return {
    plate, vehicle_type: body.vehicle_type, vehicle_type_detail: body.vehicle_type === 'other' ? detail : null, brand: asText(body.brand), model: asText(body.model),
    manufacture_year: body.manufacture_year ?? null, capacity_cylinders: capacity, max_load_kg: body.max_load_kg ?? null, licensing_due_on: body.licensing_due_on ?? null,
  };
}
const isReply = (value: Json | Reply): value is Reply => 'status' in value && 'json' in value;

function createVehicle({ org, body, mock }: OperationContext): Reply {
  const values = fields(body);
  if (isReply(values)) return values;
  const owner = vehiclesOf(mock, org).find((vehicle) => vehicle.plate === values.plate);
  if (owner) return fail('PLATE_CONFLICT', 409, { vehicle_id: owner.id, plate: owner.plate });
  const id = mock.nextId('85');
  mock.vehicles.push({ id, organization_id: org, ...values, status: 'available', version: 1, created_at: mock.now().toISOString() });
  mock.appendEvent('vehicle', id, org, 'vehicle_created', null, { plate: values.plate });
  return ok('CREATED', { vehicle_id: id, version: 1 });
}

function updateVehicle({ org, body, mock }: OperationContext): Reply {
  const vehicle = vehicleOf(mock, org, body.vehicle_id);
  if (!vehicle) return fail('NOT_FOUND', 404);
  if (vehicle.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (vehicle.status === 'inactive') return fail('INACTIVE_RECORD', 409);
  const values = fields(body);
  if (isReply(values)) return values;
  if (values.plate !== vehicle.plate) {
    if (asText(body.justification) === null) return fail('JUSTIFICATION_REQUIRED', 400);
    const owner = vehiclesOf(mock, org).find((other) => other.plate === values.plate && other.id !== vehicle.id);
    if (owner) return fail('PLATE_CONFLICT', 409, { vehicle_id: owner.id, plate: owner.plate });
  }
  const changes = ['plate', 'capacity_cylinders', 'brand'].filter((field) => values[field] !== vehicle[field]).map((field) => ({ field, old: vehicle[field], new: values[field] }));
  Object.assign(vehicle, values, { version: (vehicle.version as number) + 1 });
  mock.appendEvent('vehicle', vehicle.id as string, org, 'vehicle_updated', asText(body.justification), { changes });
  return ok('UPDATED', { version: vehicle.version });
}

function changeStatus({ org, body, mock }: OperationContext): Reply {
  const vehicle = vehicleOf(mock, org, body.vehicle_id);
  if (!vehicle) return fail('NOT_FOUND', 404);
  if (vehicle.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  const target = body.status;
  if (vehicle.status === target) return invalid('status', 'O veículo já está nesta situação.');
  if (vehicle.status === 'inactive' && target !== 'available') return invalid('status', 'Um veículo inativo só volta para disponível.');
  if ((target === 'inactive' || vehicle.status === 'inactive') && asText(body.justification) === null) return fail('JUSTIFICATION_REQUIRED', 400);
  const from = vehicle.status;
  Object.assign(vehicle, { status: target, version: (vehicle.version as number) + 1 });
  mock.appendEvent('vehicle', vehicle.id as string, org, 'vehicle_status_changed', asText(body.justification), { from, to: target });
  return ok('STATUS_CHANGED', { version: vehicle.version, status: target });
}

function listVehicles({ org, body, mock }: OperationContext): Reply {
  const status = typeof body.status === 'string' ? body.status : 'active';
  const search = lower(body.search).trim().replace(/[-\s]/g, '');
  let items = vehiclesOf(mock, org).filter((vehicle) => (status === 'all' ? true : status === 'active' ? vehicle.status !== 'inactive' : vehicle.status === status));
  if (typeof body.vehicle_type === 'string') items = items.filter((vehicle) => vehicle.vehicle_type === body.vehicle_type);
  if (typeof body.licensing_status === 'string') items = items.filter((vehicle) => view(mock, vehicle).licensing_status === body.licensing_status);
  if (search !== '') items = items.filter((vehicle) => lower(vehicle.plate).includes(search) || lower(vehicle.brand).includes(search) || lower(vehicle.model).includes(search));
  items = [...items].sort((a, b) => String(a.plate).localeCompare(String(b.plate)));
  const limit = typeof body.limit === 'number' ? body.limit : 25;
  const offset = typeof body.cursor === 'string' && /^o:\d+$/.test(body.cursor) ? Number(body.cursor.slice(2)) : 0;
  return ok('LISTED', { items: items.slice(offset, offset + limit).map((vehicle) => view(mock, vehicle)), total: items.length, next: offset + limit < items.length ? `o:${offset + limit}` : null });
}

function getVehicle({ org, body, mock }: OperationContext): Reply {
  const vehicle = vehicleOf(mock, org, body.vehicle_id);
  if (!vehicle) return fail('NOT_FOUND', 404);
  const row = view(mock, vehicle);
  return ok('FOUND', { vehicle: row, licensing_status: row.licensing_status });
}

export function registerVehicleOperations(mock: RegistryMock): void {
  mock.register('create_vehicle', { kind: 'manage', permission: 'vehicle.write', run: createVehicle });
  mock.register('update_vehicle', { kind: 'manage', permission: 'vehicle.write', run: updateVehicle });
  mock.register('change_vehicle_status', { kind: 'manage', permission: 'vehicle.deactivate', run: changeStatus });
  mock.register('list_vehicles', { kind: 'query', permission: 'vehicle.read', run: listVehicles });
  mock.register('get_vehicle', { kind: 'query', permission: 'vehicle.read', run: getVehicle });

  const today = mock.today();
  const seed = (org: string, n: number, plate: string, status: string, due: string | null): void => {
    mock.vehicles.push({
      id: `85000000-0000-4000-8000-${String(n + (org === ORG_B ? 500 : 0)).padStart(12, '0')}`, organization_id: org, plate, vehicle_type: 'truck', vehicle_type_detail: null,
      brand: 'Marca Sintética', model: `Modelo ${n}`, manufacture_year: 2020, capacity_cylinders: 30, max_load_kg: 5000, licensing_due_on: due, status, version: 1,
      created_at: '2026-10-01T10:00:00.000Z',
    });
    mock.appendEvent('vehicle', `85000000-0000-4000-8000-${String(n + (org === ORG_B ? 500 : 0)).padStart(12, '0')}`, org, 'vehicle_created', null, { plate });
  };
  // Tenant A: quatro veículos em situações variadas; o Tenant B tem a mesma placa de "ABC1234" (a placa só é única por organização).
  seed(ORG_A, 1, 'ABC1234', 'available', addCivilDays(today, 200));
  seed(ORG_A, 2, 'DEF5678', 'maintenance', addCivilDays(today, 10));
  seed(ORG_A, 3, 'GHI1J23', 'available', addCivilDays(today, -5));
  seed(ORG_A, 4, 'JKL9012', 'inactive', null);
  seed(ORG_B, 1, 'ABC1234', 'available', addCivilDays(today, 200));
  seed(ORG_B, 2, 'XYZ0000', 'available', null);
}
