import { normalizeCnpj, normalizeCpf, validateCnpj, validateCpf } from '../../../src/domain/registry/document-validation';
import { registerAnonymizationOperations } from './mock-registry-anonymization';
import { registerHistoryOperation, registerLifecycleOperations } from './mock-registry-lifecycle';
import { registerDriverOperations } from './mock-registry-drivers';
import { registerVehicleOperations } from './mock-registry-fleet';
import { registerGeofenceOperations } from './mock-registry-geofences';
import { fail, ok, ORG_A, ORG_B, RegistryMock, type Json, type OperationContext, type Reply } from './mock-registry';

// Clientes, contatos e unidades do backend simulado (Spec 007, US1 e US2). Reproduz o contrato de
// specs/007-clientes-geocercas-frota/contracts/operacoes-servidor.md em memória: documento único por organização, nome de unidade
// único por cliente, versão otimista, contatos substituídos de forma atômica, telefone e e-mail dos contatos só para quem escreve,
// busca, filtros e paginação. As regras de banco de verdade são provadas nas suítes pgTAP e `.live`.

const SEGMENTS = ['hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other'];
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const maskCpf = (cpf: string): string => `***.***.***-${cpf.slice(-2)}`;
const formatCnpj = (cnpj: string): string => `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
const lower = (value: unknown): string => String(value ?? '').toLowerCase();
const invalid = (field: string, message: string): Reply => fail('VALIDATION_FAILED', 400, { fields: [{ field, message }] });

// Fornece CNPJs e CPFs fictícios válidos para a massa de exemplo (nunca documentos reais).
function checkDigits(base: number[], weights: number[]): number {
  const sum = base.reduce((total, digit, index) => total + digit * (weights[index] ?? 0), 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}
export function syntheticCnpj(n: number): string {
  const base = String(10_000_000 + n).padStart(8, '0').split('').map(Number).concat([0, 0, 0, 1]);
  const d1 = checkDigits(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigits([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base.join('')}${d1}${d2}`;
}
export function syntheticCpf(n: number): string {
  const base = String(100_000_000 + n).split('').map(Number).slice(0, 9);
  const d1 = checkDigits(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigits([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base.join('')}${d1}${d2}`;
}

// Cópia do objeto sem as colunas internas (a organização e a chave do documento nunca saem do servidor).
const without = (source: Json, ...keys: string[]): Json => Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));

const customersOf = (mock: RegistryMock, org: string): Json[] => mock.customers.filter((customer) => customer.organization_id === org);
const customerOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => customersOf(mock, org).find((customer) => customer.id === id);
const sitesOf = (mock: RegistryMock, customerId: unknown): Json[] => mock.sites.filter((site) => site.customer_id === customerId);
const activeGeofences = (mock: RegistryMock, siteId: unknown): number => mock.geofences.filter((geofence) => geofence.site_id === siteId && geofence.status === 'active').length;

function contactsBody(value: unknown): Json[] | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 10) return 'invalid';
  return value.map((entry, index) => {
    const raw = (entry ?? {}) as Json;
    return { name: asText(raw.name) ?? '', role: asText(raw.role), phone: asText(raw.phone), email: asText(raw.email)?.toLowerCase() ?? null, is_primary: raw.is_primary === true, position: index + 1 };
  });
}

function customerRow(mock: RegistryMock, customer: Json): Json {
  const sites = sitesOf(mock, customer.id);
  return { ...without(customer, 'document_key', 'organization_id'), cities: [...new Set(sites.map((site) => site.city as string))], site_count: sites.length };
}

function siteRow(site: Json, customer: Json): Json {
  return { ...without(site, 'organization_id'), customer_name: customer.legal_name, customer_status: customer.status };
}

function page(items: Json[], body: Json): Json {
  const limit = typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 100) : 25;
  const offset = typeof body.cursor === 'string' && /^o:\d+$/.test(body.cursor) ? Number(body.cursor.slice(2)) : 0;
  const slice = items.slice(offset, offset + limit);
  return { total: items.length, next: offset + limit < items.length ? `o:${offset + limit}` : null, slice };
}

function createCustomer({ org, body, mock }: OperationContext): Reply {
  const type = body.person_type;
  if (type !== 'legal' && type !== 'individual') return invalid('person_type', 'Tipo de pessoa inválido.');
  const raw = String(body.document ?? '');
  const key = type === 'legal' ? normalizeCnpj(raw) : normalizeCpf(raw);
  if (!(type === 'legal' ? validateCnpj(key) : validateCpf(key))) return invalid('document', 'Documento inválido.');
  const name = asText(body.legal_name);
  if (name === null || name.length < 2) return invalid('legal_name', 'Informe o nome.');
  if (typeof body.segment !== 'string' || !SEGMENTS.includes(body.segment)) return invalid('segment', 'Segmento inválido.');
  const owner = customersOf(mock, org).find((customer) => customer.document_key === key);
  if (owner) return fail('DOCUMENT_CONFLICT', 409, { entity_id: owner.id, owner_name: owner.legal_name });
  const contacts = contactsBody(body.contacts);
  if (contacts === 'invalid') return invalid('contacts', 'Use no máximo 10 contatos.');
  const id = mock.nextId('81');
  mock.customers.push({
    id, organization_id: org, person_type: type, document_key: key, document_display: type === 'legal' ? formatCnpj(key) : maskCpf(key), legal_name: name,
    trade_name: asText(body.trade_name), segment: body.segment, segment_detail: asText(body.segment_detail), notes: asText(body.notes), status: 'active', version: 1,
    anonymized_at: null, created_at: mock.now().toISOString(),
  });
  for (const contact of contacts ?? []) mock.contacts.push({ id: mock.nextId('83'), organization_id: org, customer_id: id, anonymized_at: null, ...contact });
  mock.appendEvent('customer', id, org, 'customer_created', null, { contacts: contacts?.length ?? 0 });
  return ok('CREATED', { customer_id: id, version: 1 });
}

function updateCustomer({ org, body, mock }: OperationContext): Reply {
  const customer = customerOf(mock, org, body.customer_id);
  if (!customer) return fail('NOT_FOUND', 404);
  if (customer.anonymized_at) return fail('ANONYMIZED_RECORD', 409);
  if (customer.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (customer.status !== 'active') return fail('INACTIVE_RECORD', 409);
  const name = asText(body.legal_name);
  if (name === null || name.length < 2) return invalid('legal_name', 'Informe o nome.');
  if (body.document !== undefined && body.document !== null) {
    if (asText(body.justification) === null) return fail('JUSTIFICATION_REQUIRED', 400);
    const key = customer.person_type === 'legal' ? normalizeCnpj(String(body.document)) : normalizeCpf(String(body.document));
    if (!(customer.person_type === 'legal' ? validateCnpj(key) : validateCpf(key))) return invalid('document', 'Documento inválido.');
    const owner = customersOf(mock, org).find((other) => other.document_key === key && other.id !== customer.id);
    if (owner) return fail('DOCUMENT_CONFLICT', 409, { entity_id: owner.id, owner_name: owner.legal_name });
    customer.document_key = key;
    customer.document_display = customer.person_type === 'legal' ? formatCnpj(key) : maskCpf(key);
    mock.appendEvent('customer', customer.id as string, org, 'document_changed', asText(body.justification), {});
  }
  const contacts = contactsBody(body.contacts);
  if (contacts === 'invalid') return invalid('contacts', 'Use no máximo 10 contatos.');
  // Campos pessoais de cliente pessoa física só aparecem no evento pelo nome; os de pessoa jurídica, com valor antigo e novo.
  const nameChanged = name !== customer.legal_name;
  const eventData: Json = customer.person_type === 'individual' ? { changed_sensitive: nameChanged ? ['legal_name'] : [] } : { changes: nameChanged ? [{ field: 'legal_name', old: customer.legal_name, new: name }] : [] };
  Object.assign(customer, {
    legal_name: name, trade_name: asText(body.trade_name), segment: body.segment ?? customer.segment, segment_detail: asText(body.segment_detail),
    notes: asText(body.notes), version: (customer.version as number) + 1,
  });
  if (contacts !== null) {
    // Substitui os contatos não anonimizados; os anonimizados permanecem.
    mock.contacts = mock.contacts.filter((contact) => contact.customer_id !== customer.id || contact.anonymized_at);
    for (const contact of contacts) mock.contacts.push({ id: mock.nextId('83'), organization_id: org, customer_id: customer.id, anonymized_at: null, ...contact });
    mock.appendEvent('customer', customer.id as string, org, 'contacts_changed', null, { count: contacts.length });
  }
  mock.appendEvent('customer', customer.id as string, org, 'customer_updated', null, eventData);
  return ok('UPDATED', { version: customer.version });
}

const SITE_FIELDS = [
  'name', 'postal_code', 'street', 'number', 'complement', 'district', 'city', 'state', 'ibge_code', 'latitude', 'longitude', 'receiving_contact_name',
  'receiving_contact_phone', 'receiving_days', 'receiving_from', 'receiving_to', 'access_instructions',
];

function siteValues(body: Json): Json | Reply {
  const name = asText(body.name);
  if (name === null || name.length < 2) return invalid('name', 'Informe o nome da unidade.');
  if (!/^\d{8}$/.test(String(body.postal_code ?? ''))) return invalid('postal_code', 'CEP inválido.');
  const values: Json = {};
  for (const field of SITE_FIELDS) values[field] = body[field] === undefined ? null : body[field];
  return values;
}
const isReply = (value: Json | Reply): value is Reply => 'status' in value && 'json' in value;

// Origem e confirmação das coordenadas como no banco (RF-065): confirmar grava o instante; editar à mão torna a origem manual;
// mudar o endereço sem nova confirmação descarta a confirmação.
function coordinatesOrigin(body: Json, values: Json, previous: Json | null, mock: RegistryMock): Json {
  if (values.latitude === null || values.latitude === undefined) return { coordinates_source: null, coordinates_confirmed_at: null };
  const geocoded = body.coordinates_source === 'geocoded';
  if (previous === null) return { coordinates_source: geocoded ? 'geocoded' : 'manual', coordinates_confirmed_at: geocoded ? mock.now().toISOString() : null };
  const coordsChanged = previous.latitude !== values.latitude || previous.longitude !== values.longitude;
  const addressChanged = ['postal_code', 'street', 'number', 'district', 'city', 'state'].some((field) => previous[field] !== values[field]);
  if (geocoded && (coordsChanged || addressChanged || !previous.coordinates_confirmed_at)) return { coordinates_source: 'geocoded', coordinates_confirmed_at: mock.now().toISOString() };
  if (coordsChanged) return { coordinates_source: 'manual', coordinates_confirmed_at: null };
  if (addressChanged) return { coordinates_confirmed_at: null };
  return {};
}

function createSite({ org, body, mock }: OperationContext): Reply {
  const customer = customerOf(mock, org, body.customer_id);
  if (!customer) return fail('NOT_FOUND', 404);
  if (customer.status !== 'active') return fail('PARENT_INACTIVE', 409);
  const values = siteValues(body);
  if (isReply(values)) return values;
  if (sitesOf(mock, customer.id).some((site) => lower(site.name) === lower(values.name))) return fail('NAME_CONFLICT', 409);
  const id = mock.nextId('82');
  mock.sites.push({ id, organization_id: org, customer_id: customer.id, ...values, ...coordinatesOrigin(body, values, null, mock), first_delivery_confirmed: false, status: 'active', version: 1, anonymized_at: null });
  mock.appendEvent('site', id, org, 'site_created', null, {});
  return ok('CREATED', { site_id: id, version: 1 });
}

function updateSite({ org, body, mock }: OperationContext): Reply {
  const site = mock.sites.find((candidate) => candidate.id === body.site_id && candidate.organization_id === org);
  if (!site) return fail('NOT_FOUND', 404);
  if (site.anonymized_at) return fail('ANONYMIZED_RECORD', 409);
  if (site.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (site.status !== 'active') return fail('INACTIVE_RECORD', 409);
  const values = siteValues(body);
  if (isReply(values)) return values;
  if (sitesOf(mock, site.customer_id).some((other) => other.id !== site.id && lower(other.name) === lower(values.name))) return fail('NAME_CONFLICT', 409);
  Object.assign(site, values, coordinatesOrigin(body, values, site, mock), { version: (site.version as number) + 1 });
  mock.appendEvent('site', site.id as string, org, 'site_updated', null, {});
  return ok('UPDATED', { version: site.version });
}

function listCustomers({ org, body, mock }: OperationContext): Reply {
  const search = lower(body.search).trim();
  const status = typeof body.status === 'string' ? body.status : 'active';
  let items = customersOf(mock, org).filter((customer) => status === 'all' || customer.status === status);
  if (typeof body.segment === 'string') items = items.filter((customer) => customer.segment === body.segment);
  if (typeof body.state === 'string') items = items.filter((customer) => sitesOf(mock, customer.id).some((site) => site.state === body.state));
  if (typeof body.has_geofence === 'boolean') items = items.filter((customer) => sitesOf(mock, customer.id).some((site) => activeGeofences(mock, site.id) > 0) === body.has_geofence);
  if (search !== '') {
    // Documento só por igualdade do valor completo; nome, fantasia, cidade e unidade por trecho. Registro anonimizado não casa.
    const digits = search.replace(/[^0-9a-z]/g, '');
    items = items.filter((customer) => !customer.anonymized_at && (
      lower(customer.legal_name).includes(search) || lower(customer.trade_name).includes(search) || (digits.length >= 11 && customer.document_key === digits.toUpperCase())
      || sitesOf(mock, customer.id).some((site) => lower(site.name).includes(search) || lower(site.city).includes(search))));
  }
  items = [...items].sort((a, b) => lower(a.legal_name).localeCompare(lower(b.legal_name)) || String(a.id).localeCompare(String(b.id)));
  const result = page(items, body);
  return ok('LISTED', { items: (result.slice as Json[]).map((customer) => customerRow(mock, customer)), total: result.total, next: result.next });
}

function getCustomer({ org, body, mock, can }: OperationContext): Reply {
  const customer = customerOf(mock, org, body.customer_id);
  if (!customer) return fail('NOT_FOUND', 404);
  const canWrite = can(org, 'customer.write');
  const contacts = mock.contacts.filter((contact) => contact.customer_id === customer.id).sort((a, b) => (a.position as number) - (b.position as number))
    .map((contact) => (canWrite ? { ...contact } : { id: contact.id, name: contact.name, role: contact.role, is_primary: contact.is_primary, anonymized_at: contact.anonymized_at }));
  const sites = sitesOf(mock, customer.id).map((site) => ({ id: site.id, name: site.name, city: site.city, state: site.state, status: site.status, active_geofences: activeGeofences(mock, site.id), anonymized_at: site.anonymized_at }));
  return ok('FOUND', { customer: without(customer, 'document_key', 'organization_id'), contacts, sites });
}

function listSites({ org, body, mock }: OperationContext): Reply {
  const search = lower(body.search).trim();
  const status = typeof body.status === 'string' ? body.status : 'active';
  let items = mock.sites.filter((site) => site.organization_id === org && (status === 'all' || site.status === status));
  if (typeof body.customer_id === 'string') items = items.filter((site) => site.customer_id === body.customer_id);
  if (search !== '') items = items.filter((site) => lower(site.name).includes(search) || lower(site.city).includes(search));
  items = [...items].sort((a, b) => lower(a.name).localeCompare(lower(b.name)) || String(a.id).localeCompare(String(b.id)));
  const result = page(items, body);
  return ok('LISTED', {
    items: (result.slice as Json[]).map((site) => ({ ...siteRow(site, customerOf(mock, org, site.customer_id) ?? {}), has_geofence: activeGeofences(mock, site.id) > 0 })),
    total: result.total, next: result.next,
  });
}

// Unidades ativas de clientes ativos e não anonimizados que têm coordenadas (list_site_points).
function listSitePoints({ org, body, mock }: OperationContext): Reply {
  const limit = typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 1000) : 500;
  const all = mock.sites
    .filter((site) => site.organization_id === org && site.status === 'active' && site.latitude !== null && site.latitude !== undefined && !site.anonymized_at)
    .filter((site) => customerOf(mock, org, site.customer_id)?.status === 'active')
    .sort((a, b) => lower(a.name).localeCompare(lower(b.name)) || String(a.id).localeCompare(String(b.id)));
  const items = all.slice(0, limit).map((site) => ({
    id: site.id, name: site.name, customer_id: site.customer_id, customer_name: customerOf(mock, org, site.customer_id)?.legal_name ?? '', city: site.city,
    state: site.state, latitude: site.latitude, longitude: site.longitude, confirmed: Boolean(site.coordinates_confirmed_at),
  }));
  return ok('FOUND', { total: all.length, items });
}

function getSite({ org, body, mock }: OperationContext): Reply {
  const site = mock.sites.find((candidate) => candidate.id === body.site_id && candidate.organization_id === org);
  if (!site) return fail('NOT_FOUND', 404);
  const customer = customerOf(mock, org, site.customer_id) ?? {};
  const geofences = mock.geofences.filter((geofence) => geofence.site_id === site.id).map((geofence) => ({ id: geofence.id, name: geofence.name, shape: geofence.shape, status: geofence.status }));
  return ok('FOUND', { site: siteRow(site, customer), geofences });
}

const SEGMENT_CYCLE = ['hospital', 'clinic', 'laboratory', 'industry', 'distributor'];

// Acrescenta um cliente jurídico com uma unidade e um contato à massa (usado pela massa inicial e pelos E2E de volume).
export function addCustomer(mock: RegistryMock, org: string, n: number, label: string, document: string): void {
  const suffix = String(n + (org === ORG_B ? 500 : 0)).padStart(12, '0');
  const id = `81000000-0000-4000-8000-${suffix}`;
  mock.customers.push({
    id, organization_id: org, person_type: 'legal', document_key: document, document_display: formatCnpj(document), legal_name: `${label} ${String(n).padStart(2, '0')}`,
    trade_name: n % 2 === 0 ? `Fantasia ${n}` : null, segment: SEGMENT_CYCLE[n % SEGMENT_CYCLE.length], segment_detail: null, notes: null, status: n % 17 === 0 ? 'inactive' : 'active',
    version: 1, anonymized_at: null, created_at: '2026-10-01T10:00:00.000Z',
  });
  mock.sites.push({
    id: `82000000-0000-4000-8000-${suffix}`, organization_id: org, customer_id: id, name: 'Matriz', postal_code: '01001000', street: 'Praça da Sé',
    number: String(n), complement: null, district: 'Sé', city: n % 2 === 0 ? 'São Paulo' : 'Campinas', state: 'SP', ibge_code: '3550308', latitude: null, longitude: null,
    coordinates_source: null, coordinates_confirmed_at: null, first_delivery_confirmed: false,
    receiving_contact_name: null, receiving_contact_phone: null, receiving_days: [1, 2, 3, 4, 5], receiving_from: '08:00:00', receiving_to: '17:00:00', access_instructions: null,
    status: n % 17 === 0 ? 'inactive' : 'active', version: 1, anonymized_at: null,
  });
  mock.contacts.push({
    id: `83000000-0000-4000-8000-${suffix}`, organization_id: org, customer_id: id, name: `Contato ${n}`, role: 'Compras', phone: '11987654321',
    email: `contato${n}@example.invalid`, is_primary: true, position: 1, anonymized_at: null,
  });
  mock.appendEvent('customer', id, org, 'customer_created', null, {});
}

export interface CustomerSeed { orgA: number; orgB: number }

// Registra as operações e a massa de exemplo: dois tenants, com o **mesmo** CNPJ em ambos (o documento é único por organização).
export function registerCustomerOperations(mock: RegistryMock, seed: CustomerSeed = { orgA: 3, orgB: 2 }): void {
  mock.register('create_customer', { kind: 'manage', permission: 'customer.write', run: createCustomer });
  mock.register('update_customer', { kind: 'manage', permission: 'customer.write', run: updateCustomer });
  mock.register('create_site', { kind: 'manage', permission: 'customer.write', run: createSite });
  mock.register('update_site', { kind: 'manage', permission: 'customer.write', run: updateSite });
  mock.register('list_customers', { kind: 'query', permission: 'customer.read', run: listCustomers });
  mock.register('get_customer', { kind: 'query', permission: 'customer.read', run: getCustomer });
  mock.register('list_sites', { kind: 'query', permission: 'customer.read', run: listSites });
  mock.register('list_site_points', { kind: 'query', permission: 'customer.read', run: listSitePoints });
  mock.register('get_site', { kind: 'query', permission: 'customer.read', run: getSite });

  // O Tenant B tem o mesmo CNPJ de "Cliente Exemplo 01" do Tenant A: o documento só é único dentro da organização.
  for (let n = 1; n <= seed.orgA; n += 1) addCustomer(mock, ORG_A, n, 'Cliente Exemplo', syntheticCnpj(n));
  for (let n = 1; n <= seed.orgB; n += 1) addCustomer(mock, ORG_B, n, 'Cliente do Tenant B', syntheticCnpj(n));
}

// Backend simulado completo da Spec 007: cada história acrescenta aqui o registro das suas operações.
export function createRegistryMock(): RegistryMock {
  const mock = new RegistryMock();
  registerCustomerOperations(mock);
  registerGeofenceOperations(mock);
  registerVehicleOperations(mock);
  registerDriverOperations(mock);
  registerLifecycleOperations(mock);
  registerHistoryOperation(mock);
  registerAnonymizationOperations(mock);
  return mock;
}
