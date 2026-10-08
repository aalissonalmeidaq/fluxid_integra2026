import { normalizeCnh, normalizeCpf, validateCnh, validateCpf } from '../../../src/domain/registry/document-validation';
import { maskCnh, maskCpf } from '../../../src/domain/registry/masks';
import { addCivilDays } from '../../../src/domain/shared/civil-date';
import { validityStatus } from '../../../src/domain/shared/validity-status';
import { fail, ok, ORG_A, ORG_B, type Json, type OperationContext, type RegistryMock, type Reply } from './mock-registry';
import { syntheticCpf } from './mock-registry-customers';

// Motoristas do backend simulado (Spec 007, US5): documentos protegidos, vínculo com usuário e revelação. CPF e CNH completos ficam em
// `driverDocuments` (nunca em lista nem detalhe); só `reveal_document` os devolve, como no banco real. As regras de verdade são
// provadas nas suítes pgTAP.

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'];
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const lower = (value: unknown): string => String(value ?? '').toLowerCase();
const invalid = (field: string, message: string): Reply => fail('VALIDATION_FAILED', 400, { fields: [{ field, message }] });

export interface LinkableUser { id: string; organization_id: string; display_name: string; active: boolean }

// Usuários com o papel de motorista, por organização (o simulado guarda aqui; o banco real consulta memberships e roles).
export const DRIVER_USER_A1 = '10000000-0000-4000-8000-0000000000e1';
export const DRIVER_USER_A2 = '10000000-0000-4000-8000-0000000000e2';

const driversOf = (mock: RegistryMock, org: string): Json[] => mock.drivers.filter((driver) => driver.organization_id === org);
const driverOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => driversOf(mock, org).find((driver) => driver.id === id);

function view(driver: Json, mock: RegistryMock, withPhone = false): Json {
  const result: Json = {
    id: driver.id, full_name: driver.full_name, cpf_display: driver.cpf_display, cnh_display: driver.cnh_display, cnh_category: driver.cnh_category,
    cnh_valid_until: driver.cnh_valid_until, cnh_status: validityStatus(driver.cnh_valid_until as string, mock.today()), status: driver.status, version: driver.version,
    linked: driver.linked_user_id !== null, anonymized_at: driver.anonymized_at,
  };
  if (withPhone) result.phone = driver.phone;
  return result;
}

function documents(mock: RegistryMock, id: unknown): { cpf: string | null; cnh: string | null } {
  return (mock.driverDocuments.get(String(id)) as { cpf: string | null; cnh: string | null } | undefined) ?? { cpf: null, cnh: null };
}

function validateCommon(body: Json): Reply | null {
  const name = asText(body.full_name);
  if (name === null || name.length < 2) return invalid('full_name', 'Informe o nome.');
  if (typeof body.cnh_category !== 'string' || !CATEGORIES.includes(body.cnh_category)) return invalid('cnh_category', 'Categoria inválida.');
  if (typeof body.cnh_valid_until !== 'string') return invalid('cnh_valid_until', 'Informe a validade.');
  return null;
}

function createDriver({ org, body, mock }: OperationContext): Reply {
  const problem = validateCommon(body);
  if (problem) return problem;
  const cpf = normalizeCpf(String(body.cpf ?? ''));
  const cnh = normalizeCnh(String(body.cnh_number ?? ''));
  if (!validateCpf(cpf)) return invalid('cpf', 'CPF inválido.');
  if (!validateCnh(cnh)) return invalid('cnh_number', 'CNH inválida.');
  for (const driver of driversOf(mock, org)) {
    const docs = documents(mock, driver.id);
    if (docs.cpf === cpf) return fail('DOCUMENT_CONFLICT', 409, { field: 'cpf', entity_id: driver.id, owner_name: driver.full_name });
    if (docs.cnh === cnh) return fail('DOCUMENT_CONFLICT', 409, { field: 'cnh_number', entity_id: driver.id, owner_name: driver.full_name });
  }
  const id = mock.nextId('86');
  mock.drivers.push({
    id, organization_id: org, full_name: asText(body.full_name), phone: asText(body.phone), cpf_display: maskCpf(cpf), cnh_display: maskCnh(cnh), cnh_category: body.cnh_category,
    cnh_valid_until: body.cnh_valid_until, linked_user_id: null, status: 'active', version: 1, anonymized_at: null, created_at: mock.now().toISOString(),
  });
  mock.driverDocuments.set(id, { cpf, cnh });
  mock.appendEvent('driver', id, org, 'driver_created', null, { cnh_category: body.cnh_category });
  return ok('CREATED', { driver_id: id, version: 1 });
}

function updateDriver({ org, body, mock }: OperationContext): Reply {
  const driver = driverOf(mock, org, body.driver_id);
  if (!driver) return fail('NOT_FOUND', 404);
  if (driver.anonymized_at) return fail('ANONYMIZED_RECORD', 409);
  if (driver.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (driver.status !== 'active') return fail('INACTIVE_RECORD', 409);
  const problem = validateCommon(body);
  if (problem) return problem;
  const docs = documents(mock, driver.id);
  const newCpf = body.cpf === undefined || body.cpf === null ? null : normalizeCpf(String(body.cpf));
  const newCnh = body.cnh_number === undefined || body.cnh_number === null ? null : normalizeCnh(String(body.cnh_number));
  if (newCpf !== null && !validateCpf(newCpf)) return invalid('cpf', 'CPF inválido.');
  if (newCnh !== null && !validateCnh(newCnh)) return invalid('cnh_number', 'CNH inválida.');
  if ((newCpf !== null || newCnh !== null) && asText(body.justification) === null) return fail('JUSTIFICATION_REQUIRED', 400);
  for (const other of driversOf(mock, org).filter((candidate) => candidate.id !== driver.id)) {
    const otherDocs = documents(mock, other.id);
    if (newCpf !== null && otherDocs.cpf === newCpf) return fail('DOCUMENT_CONFLICT', 409, { field: 'cpf', entity_id: other.id, owner_name: other.full_name });
    if (newCnh !== null && otherDocs.cnh === newCnh) return fail('DOCUMENT_CONFLICT', 409, { field: 'cnh_number', entity_id: other.id, owner_name: other.full_name });
  }
  if (newCpf !== null) { docs.cpf = newCpf; driver.cpf_display = maskCpf(newCpf); }
  if (newCnh !== null) { docs.cnh = newCnh; driver.cnh_display = maskCnh(newCnh); }
  mock.driverDocuments.set(String(driver.id), docs);
  Object.assign(driver, { full_name: asText(body.full_name), phone: asText(body.phone), cnh_category: body.cnh_category, cnh_valid_until: body.cnh_valid_until, version: (driver.version as number) + 1 });
  mock.appendEvent('driver', driver.id as string, org, 'driver_updated', null, { changed_sensitive: ['full_name'] });
  return ok('UPDATED', { version: driver.version });
}

function listDrivers({ org, body, mock }: OperationContext): Reply {
  const status = typeof body.status === 'string' ? body.status : 'active';
  const search = lower(body.search).trim();
  const digits = search.replace(/\D/g, '');
  let items = driversOf(mock, org).filter((driver) => status === 'all' || driver.status === status);
  if (typeof body.cnh_status === 'string') items = items.filter((driver) => view(driver, mock).cnh_status === body.cnh_status);
  if (typeof body.linked === 'boolean') items = items.filter((driver) => (driver.linked_user_id !== null) === body.linked);
  if (search !== '') {
    items = items.filter((driver) => !driver.anonymized_at && (lower(driver.full_name).includes(search)
      || (digits.length === 11 && (documents(mock, driver.id).cpf === digits || documents(mock, driver.id).cnh === digits))));
  }
  items = [...items].sort((a, b) => lower(a.full_name).localeCompare(lower(b.full_name)));
  const limit = typeof body.limit === 'number' ? body.limit : 25;
  const offset = typeof body.cursor === 'string' && /^o:\d+$/.test(body.cursor) ? Number(body.cursor.slice(2)) : 0;
  return ok('LISTED', { items: items.slice(offset, offset + limit).map((driver) => view(driver, mock)), total: items.length, next: offset + limit < items.length ? `o:${offset + limit}` : null });
}

function getDriver({ org, body, mock }: OperationContext): Reply {
  const driver = driverOf(mock, org, body.driver_id);
  if (!driver) return fail('NOT_FOUND', 404);
  const user = driver.linked_user_id === null ? null : mock.linkableUsers.find((candidate) => candidate.id === driver.linked_user_id);
  return ok('FOUND', {
    driver: view(driver, mock, true), cnh_status: view(driver, mock).cnh_status,
    linked_user: driver.linked_user_id === null ? null : { id: driver.linked_user_id, display_name: user?.display_name ?? 'Usuário', active: user?.active ?? false },
  });
}

function listLinkableUsers({ org, mock }: OperationContext): Reply {
  const taken = new Set(driversOf(mock, org).map((driver) => driver.linked_user_id));
  return ok('LISTED', { users: mock.linkableUsers.filter((user) => user.organization_id === org && user.active && !taken.has(user.id)).map((user) => ({ id: user.id, display_name: user.display_name })) });
}

function linkUser({ org, body, mock }: OperationContext): Reply {
  const driver = driverOf(mock, org, body.driver_id);
  if (!driver) return fail('NOT_FOUND', 404);
  if (driver.status !== 'active') return fail('INACTIVE_RECORD', 409);
  const eligible = mock.linkableUsers.some((user) => user.id === body.user_id && user.organization_id === org && user.active)
    && !driversOf(mock, org).some((other) => other.linked_user_id === body.user_id);
  if (!eligible || driver.linked_user_id !== null) return fail('USER_NOT_ELIGIBLE', 409);
  driver.linked_user_id = body.user_id;
  mock.appendEvent('driver', driver.id as string, org, 'driver_user_linked', null, {});
  return ok('LINKED', { version: driver.version });
}

function unlinkUser({ org, body, mock }: OperationContext): Reply {
  const driver = driverOf(mock, org, body.driver_id);
  if (!driver) return fail('NOT_FOUND', 404);
  if (asText(body.justification) === null) return fail('JUSTIFICATION_REQUIRED', 400);
  if (driver.linked_user_id === null) return invalid('driver_id', 'Este motorista não tem usuário vinculado.');
  driver.linked_user_id = null;
  mock.appendEvent('driver', driver.id as string, org, 'driver_user_unlinked', asText(body.justification), {});
  return ok('UNLINKED', { version: driver.version });
}

// A revelação exige a permissão de documento da área do cadastro (o simulado confere a do `entity_type` pedido).
function revealDocument({ org, body, mock, can }: OperationContext): Reply {
  const type = body.entity_type;
  if (type !== 'customer' && type !== 'driver') return invalid('entity_type', 'Tipo desconhecido.');
  if (!can(org, `${type}.document`)) return fail('ACCESS_DENIED', 403);
  let value: string | null;
  if (type === 'driver') {
    const driver = driverOf(mock, org, body.entity_id);
    if (!driver) return fail('NOT_FOUND', 404);
    const docs = documents(mock, driver.id);
    value = body.document === 'cpf' ? docs.cpf : docs.cnh;
    if (value === null) return fail('ANONYMIZED_RECORD', 409);
    mock.appendEvent('driver', driver.id as string, org, 'document_revealed', null, { document: body.document });
  } else {
    const customer = mock.customers.find((candidate) => candidate.id === body.entity_id && candidate.organization_id === org && candidate.person_type === 'individual');
    if (!customer) return fail('NOT_FOUND', 404);
    value = (customer.document_key as string | null) ?? null;
    if (value === null) return fail('ANONYMIZED_RECORD', 409);
    mock.appendEvent('customer', customer.id as string, org, 'document_revealed', null, { document: 'cpf' });
  }
  return ok('REVEALED', { value });
}

export function registerDriverOperations(mock: RegistryMock): void {
  mock.register('create_driver', { kind: 'manage', permission: 'driver.write', run: createDriver });
  mock.register('update_driver', { kind: 'manage', permission: 'driver.write', run: updateDriver });
  mock.register('link_driver_user', { kind: 'manage', permission: 'driver.write', run: linkUser });
  mock.register('unlink_driver_user', { kind: 'manage', permission: 'driver.write', run: unlinkUser });
  // A permissão real é conferida dentro da operação (cliente ou motorista); aqui basta ter qualquer uma das duas.
  mock.register('reveal_document', { kind: 'manage', permission: ['customer.document', 'driver.document'], run: revealDocument });
  mock.register('list_drivers', { kind: 'query', permission: 'driver.read', run: listDrivers });
  mock.register('get_driver', { kind: 'query', permission: 'driver.read', run: getDriver });
  mock.register('list_linkable_users', { kind: 'query', permission: 'driver.write', run: listLinkableUsers });

  mock.linkableUsers.push(
    { id: DRIVER_USER_A1, organization_id: ORG_A, display_name: 'Condutor Um', active: true },
    { id: DRIVER_USER_A2, organization_id: ORG_A, display_name: 'Condutor Dois', active: true },
    { id: '10000000-0000-4000-8000-0000000000e3', organization_id: ORG_B, display_name: 'Condutor do B', active: true },
  );
  const today = mock.today();
  const seed = (org: string, n: number, name: string, cpfSeed: number, validUntil: string, status = 'active'): void => {
    const id = `86000000-0000-4000-8000-${String(n + (org === ORG_B ? 500 : 0)).padStart(12, '0')}`;
    const cpf = syntheticCpf(cpfSeed);
    const cnh = String(12345678900 + n * 11).padStart(11, '0');
    mock.drivers.push({
      id, organization_id: org, full_name: name, phone: '11987654321', cpf_display: maskCpf(cpf), cnh_display: maskCnh(cnh), cnh_category: 'B', cnh_valid_until: validUntil,
      linked_user_id: null, status, version: 1, anonymized_at: null, created_at: '2026-10-01T10:00:00.000Z',
    });
    mock.driverDocuments.set(id, { cpf, cnh });
    mock.appendEvent('driver', id, org, 'driver_created', null, {});
  };
  // O Tenant B tem um motorista com o mesmo CPF do primeiro do Tenant A (o documento só é único por organização).
  seed(ORG_A, 1, 'Ana Condutora', 701, addCivilDays(today, 400));
  seed(ORG_A, 2, 'Bruno Condutor', 702, addCivilDays(today, 10));
  seed(ORG_A, 3, 'Carla Condutora', 703, addCivilDays(today, -20));
  seed(ORG_A, 4, 'Diego Inativo', 704, addCivilDays(today, 400), 'inactive');
  seed(ORG_B, 1, 'Motorista do Tenant B', 701, addCivilDays(today, 400));
}
