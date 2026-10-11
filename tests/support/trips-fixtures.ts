import { callFunction } from './auth-harness';
import { syntheticCnpj, syntheticCpf } from '../e2e/support/mock-registry-customers';
import { validateCnh } from '../../src/domain/registry/document-validation';
import { addCivilDays, todayInSaoPaulo } from '../../src/domain/shared/civil-date';

// Massa de viagens para as suítes `.live` (Spec 008): cria, pelas funções reais, o que uma viagem precisa no Tenant G (cliente e
// unidade, veículo, motorista e cilindros em estoque com teste em dia). Cada execução usa identificadores novos; nada é apagado
// (o produto não exclui), então a massa só cresce no banco local e some com `supabase db reset`. Todos os dados são fictícios.

export const TENANT_G = '20000000-0000-0000-0000-000000000020';
export const GADMIN = { email: 'reg-g-admin@example.invalid', password: 'Local-only-020!' };

type Body = Record<string, unknown>;
export const manageCylinders = (token: string, body: Body) => callFunction('manage-cylinders', body, token);
export const manageRegistry = (token: string, body: Body) => callFunction('manage-registry', body, token);
export const manageTrips = (token: string, body: Body) => callFunction('manage-trips', body, token);
export const queryTrips = (token: string, body: Body) => callFunction('query-trips', body, token);

let sequence = 0;
const seed = Date.now() % 700_000;
const next = (): number => { sequence += 1; return seed * 100 + sequence; };
export const requestId = (): string => crypto.randomUUID();

function makeCnh(n: number): string {
  const base = String(100_000_000 + n).slice(0, 9);
  for (let dv1 = 0; dv1 < 10; dv1 += 1) for (let dv2 = 0; dv2 < 10; dv2 += 1) if (validateCnh(`${base}${dv1}${dv2}`)) return `${base}${dv1}${dv2}`;
  throw new Error('sem CNH válida para a semente');
}

const letters = (n: number): string => [n % 26, Math.floor(n / 26) % 26, Math.floor(n / 676) % 26].map((value) => String.fromCharCode(65 + value)).join('');
const ok = <T extends { status: number; body: unknown }>(response: T, label: string): T => {
  if (response.status !== 200) throw new Error(`${label}: HTTP ${response.status} ${JSON.stringify(response.body)}`);
  return response;
};

export async function createType(token: string): Promise<string> {
  const response = ok(await manageCylinders(token, { operation: 'save_type', organization_id: TENANT_G, gas: `Gás viagens ${next()}`, capacity_value: 10, capacity_unit: 'l', classification: 'medicinal' }), 'save_type');
  return response.body.type_id as string;
}

// Cilindro ativo, em estoque e com teste aprovado (elegível). `hydro: 'expired'` cria um com o teste vencido.
export async function createEligibleCylinder(token: string, typeId: string, label = 'TRP'): Promise<{ id: string; serial: string; identifier: string }> {
  const n = next();
  const serial = `${label}-${n}`;
  const identifier = `QR-${label}-${n}`;
  const created = ok(await manageCylinders(token, { operation: 'create', organization_id: TENANT_G, cylinder_type_id: typeId, serial_number: serial, identifier: { kind: 'qr_code', value: identifier } }), 'create cylinder');
  const id = created.body.cylinder_id as string;
  const today = todayInSaoPaulo();
  ok(await manageCylinders(token, {
    operation: 'register_test', organization_id: TENANT_G, cylinder_id: id, performed_on: addCivilDays(today, -10), result: 'approved', executor: 'Laboratório Sintético',
    next_due_on: addCivilDays(today, 300),
  }), 'register test');
  ok(await manageCylinders(token, { operation: 'stock_in', organization_id: TENANT_G, identifier_value: identifier, operation_key: crypto.randomUUID() }), 'stock in');
  return { id, serial, identifier };
}

export async function createVehicle(token: string, capacity = 100): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const plate = `${letters(next() + attempt * 7919)}${String(1000 + Math.floor(Math.random() * 9000))}`;
    const response = await manageRegistry(token, { operation: 'create_vehicle', organization_id: TENANT_G, plate, vehicle_type: 'truck', capacity_cylinders: capacity });
    if (response.status === 200) return response.body.vehicle_id as string;
    if (response.body.code !== 'PLATE_CONFLICT') throw new Error(`create_vehicle: ${JSON.stringify(response.body)}`);
  }
  throw new Error('create_vehicle: placas em conflito');
}

export async function createDriver(token: string, cnhValidUntil = '2031-01-31'): Promise<string> {
  const n = next();
  const response = ok(await manageRegistry(token, {
    operation: 'create_driver', organization_id: TENANT_G, full_name: `Motorista Viagens ${n}`, cpf: syntheticCpf(n), cnh_number: makeCnh(n), cnh_category: 'D', cnh_valid_until: cnhValidUntil,
  }), 'create_driver');
  return response.body.driver_id as string;
}

export async function createSite(token: string): Promise<{ customerId: string; siteId: string }> {
  const n = next();
  const customer = ok(await manageRegistry(token, { operation: 'create_customer', organization_id: TENANT_G, person_type: 'legal', document: syntheticCnpj(n), legal_name: `Cliente Viagens ${n}`, segment: 'hospital' }), 'create_customer');
  const customerId = customer.body.customer_id as string;
  const site = ok(await manageRegistry(token, {
    operation: 'create_site', organization_id: TENANT_G, customer_id: customerId, name: `Unidade Viagens ${n}`, postal_code: '01001000', street: 'Praça da Sé', number: String(n % 900 + 1), city: 'São Paulo', state: 'SP',
  }), 'create_site');
  return { customerId, siteId: site.body.site_id as string };
}

export interface TripWorld {
  typeId: string;
  vehicleId: string;
  driverId: string;
  siteId: string;
  customerId: string;
}

export async function createWorld(token: string): Promise<TripWorld> {
  const [typeId, vehicleId, driverId, site] = await Promise.all([createType(token), createVehicle(token), createDriver(token), createSite(token)]);
  return { typeId, vehicleId, driverId, siteId: site.siteId, customerId: site.customerId };
}

export const planBody = (world: TripWorld, stops: Array<{ site_id?: string; cylinder_ids: string[] }>, extra: Body = {}): Body => ({
  operation: 'create_trip', organization_id: TENANT_G, request_id: requestId(), planned_date: todayInSaoPaulo(), vehicle_id: world.vehicleId, driver_id: world.driverId,
  stops: stops.map((stop) => ({ site_id: stop.site_id ?? world.siteId, cylinder_ids: stop.cylinder_ids })), ...extra,
});
