import { fail, ok, type Json, type OperationContext, type RegistryMock, type Reply } from './mock-registry';

// Inativação e reativação do backend simulado (Spec 007, US6): cascata atômica no cliente e na unidade, prévia, `expected_counts`,
// reativação só do próprio registro e vínculo do motorista intacto. Nada é apagado. As regras de verdade são provadas no pgTAP.

const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim().length >= 5 ? value.trim() : null);

const customerOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => mock.customers.find((candidate) => candidate.id === id && candidate.organization_id === org);
const siteOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => mock.sites.find((candidate) => candidate.id === id && candidate.organization_id === org);
const geofenceOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => mock.geofences.find((candidate) => candidate.id === id && candidate.organization_id === org);
const driverOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => mock.drivers.find((candidate) => candidate.id === id && candidate.organization_id === org);

const activeSitesOf = (mock: RegistryMock, customerId: unknown): Json[] => mock.sites.filter((site) => site.customer_id === customerId && site.status === 'active');
const activeGeofencesOf = (mock: RegistryMock, siteIds: unknown[]): Json[] => mock.geofences.filter((geofence) => siteIds.includes(geofence.site_id) && geofence.status === 'active');

function setStatus(record: Json, status: 'active' | 'inactive'): void {
  Object.assign(record, { status, version: (record.version as number) + 1 });
}

function previewCustomer({ org, body, mock }: OperationContext): Reply {
  const customer = customerOf(mock, org, body.customer_id);
  if (!customer) return fail('NOT_FOUND', 404);
  const sites = activeSitesOf(mock, customer.id);
  const allSiteIds = mock.sites.filter((site) => site.customer_id === customer.id).map((site) => site.id);
  return ok('FOUND', { sites: sites.length, geofences: activeGeofencesOf(mock, allSiteIds).length });
}

function previewSite({ org, body, mock }: OperationContext): Reply {
  const site = siteOf(mock, org, body.site_id);
  if (!site) return fail('NOT_FOUND', 404);
  return ok('FOUND', { geofences: activeGeofencesOf(mock, [site.id]).length });
}

function inactivateCustomer({ org, body, mock }: OperationContext): Reply {
  const customer = customerOf(mock, org, body.customer_id);
  if (!customer) return fail('NOT_FOUND', 404);
  const justification = asText(body.justification);
  if (justification === null) return fail('JUSTIFICATION_REQUIRED', 400);
  if (customer.status === 'inactive') return fail('ALREADY_INACTIVE', 409);
  const sites = activeSitesOf(mock, customer.id);
  const geofences = activeGeofencesOf(mock, mock.sites.filter((site) => site.customer_id === customer.id).map((site) => site.id));
  const expected = body.expected_counts as { sites: number; geofences: number };
  if (expected.sites !== sites.length || expected.geofences !== geofences.length) return fail('CASCADE_CHANGED', 409, { counts: { sites: sites.length, geofences: geofences.length } });
  for (const geofence of geofences) { setStatus(geofence, 'inactive'); mock.appendEvent('geofence', geofence.id as string, org, 'geofence_inactivated', justification, { cascade_of: customer.id }); }
  for (const site of sites) { setStatus(site, 'inactive'); mock.appendEvent('site', site.id as string, org, 'site_inactivated', justification, { cascade_of: customer.id }); }
  setStatus(customer, 'inactive');
  mock.appendEvent('customer', customer.id as string, org, 'customer_inactivated', justification, { sites: sites.length, geofences: geofences.length });
  return ok('INACTIVATED', { version: customer.version, sites: sites.length, geofences: geofences.length });
}

function reactivate(kind: 'customer' | 'site' | 'geofence' | 'driver') {
  return ({ org, body, mock }: OperationContext): Reply => {
    const record = kind === 'customer' ? customerOf(mock, org, body.customer_id) : kind === 'site' ? siteOf(mock, org, body.site_id)
      : kind === 'geofence' ? geofenceOf(mock, org, body.geofence_id) : driverOf(mock, org, body.driver_id);
    if (!record) return fail('NOT_FOUND', 404);
    const justification = asText(body.justification);
    if (justification === null) return fail('JUSTIFICATION_REQUIRED', 400);
    if (record.anonymized_at) return fail('ANONYMIZED_RECORD', 409);
    if (record.status === 'active') return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'status', message: 'Já está ativo.' }] });
    if (kind === 'site' && customerOf(mock, org, record.customer_id)?.status !== 'active') return fail('PARENT_INACTIVE', 409);
    if (kind === 'geofence' && siteOf(mock, org, record.site_id)?.status !== 'active') return fail('PARENT_INACTIVE', 409);
    setStatus(record, 'active');
    mock.appendEvent(kind, record.id as string, org, `${kind}_reactivated`, justification, {});
    return ok('REACTIVATED', { version: record.version });
  };
}

function inactivateSite({ org, body, mock }: OperationContext): Reply {
  const site = siteOf(mock, org, body.site_id);
  if (!site) return fail('NOT_FOUND', 404);
  const justification = asText(body.justification);
  if (justification === null) return fail('JUSTIFICATION_REQUIRED', 400);
  if (site.status === 'inactive') return fail('ALREADY_INACTIVE', 409);
  const geofences = activeGeofencesOf(mock, [site.id]);
  if ((body.expected_counts as { geofences: number }).geofences !== geofences.length) return fail('CASCADE_CHANGED', 409, { counts: { sites: 0, geofences: geofences.length } });
  for (const geofence of geofences) { setStatus(geofence, 'inactive'); mock.appendEvent('geofence', geofence.id as string, org, 'geofence_inactivated', justification, { cascade_of: site.id }); }
  setStatus(site, 'inactive');
  mock.appendEvent('site', site.id as string, org, 'site_inactivated', justification, { geofences: geofences.length });
  return ok('INACTIVATED', { version: site.version, geofences: geofences.length });
}

function inactivateSimple(kind: 'geofence' | 'driver') {
  return ({ org, body, mock }: OperationContext): Reply => {
    const record = kind === 'geofence' ? geofenceOf(mock, org, body.geofence_id) : driverOf(mock, org, body.driver_id);
    if (!record) return fail('NOT_FOUND', 404);
    const justification = asText(body.justification);
    if (justification === null) return fail('JUSTIFICATION_REQUIRED', 400);
    if (record.status === 'inactive') return fail('ALREADY_INACTIVE', 409);
    setStatus(record, 'inactive');
    mock.appendEvent(kind, record.id as string, org, `${kind}_inactivated`, justification, {});
    return ok('INACTIVATED', { version: record.version });
  };
}

export function registerLifecycleOperations(mock: RegistryMock): void {
  mock.register('preview_customer_inactivation', { kind: 'query', permission: 'customer.deactivate', run: previewCustomer });
  mock.register('preview_site_inactivation', { kind: 'query', permission: 'customer.deactivate', run: previewSite });
  mock.register('inactivate_customer', { kind: 'manage', permission: 'customer.deactivate', run: inactivateCustomer });
  mock.register('reactivate_customer', { kind: 'manage', permission: 'customer.deactivate', run: reactivate('customer') });
  mock.register('inactivate_site', { kind: 'manage', permission: 'customer.deactivate', run: inactivateSite });
  mock.register('reactivate_site', { kind: 'manage', permission: 'customer.deactivate', run: reactivate('site') });
  mock.register('inactivate_geofence', { kind: 'manage', permission: 'geofence.deactivate', run: inactivateSimple('geofence') });
  mock.register('reactivate_geofence', { kind: 'manage', permission: 'geofence.deactivate', run: reactivate('geofence') });
  mock.register('inactivate_driver', { kind: 'manage', permission: 'driver.deactivate', run: inactivateSimple('driver') });
  mock.register('reactivate_driver', { kind: 'manage', permission: 'driver.deactivate', run: reactivate('driver') });
}

// Histórico (US7): somente leitura, por sequência, com a permissão `*.history` da área do cadastro.
const HISTORY_PERMISSION: Record<string, string> = { customer: 'customer.history', site: 'customer.history', geofence: 'geofence.history', vehicle: 'vehicle.history', driver: 'driver.history' };

function history({ org, body, mock, can }: OperationContext): Reply {
  const type = String(body.entity_type);
  const permission = HISTORY_PERMISSION[type];
  if (permission === undefined) return fail('VALIDATION_FAILED', 400);
  if (!can(org, permission)) return fail('ACCESS_DENIED', 403);
  const events = mock.eventsOf(type, String(body.entity_id), org);
  if (events.length === 0) return fail('NOT_FOUND', 404);
  const order = body.order === 'asc' ? 'asc' : 'desc';
  const cursor = typeof body.cursor === 'string' && /^\d+$/.test(body.cursor) ? Number(body.cursor) : null;
  let rows = [...events].sort((a, b) => (order === 'asc' ? a.sequence - b.sequence : b.sequence - a.sequence));
  if (typeof body.event_type === 'string') rows = rows.filter((event) => event.event_type === body.event_type);
  if (typeof body.from === 'string') rows = rows.filter((event) => event.occurred_at.slice(0, 10) >= String(body.from));
  if (typeof body.to === 'string') rows = rows.filter((event) => event.occurred_at.slice(0, 10) <= String(body.to));
  if (cursor !== null) rows = rows.filter((event) => (order === 'asc' ? event.sequence > cursor : event.sequence < cursor));
  const limit = typeof body.limit === 'number' ? body.limit : 25;
  const page = rows.slice(0, limit);
  return ok('LISTED', {
    events: page.map((event) => ({ id: event.id, sequence: event.sequence, event_type: event.event_type, actor_name: event.actor_name, occurred_at: event.occurred_at, justification: event.justification, data: event.data })),
    next: rows.length > limit ? String(page[page.length - 1]?.sequence) : null,
  });
}

export function registerHistoryOperation(mock: RegistryMock): void {
  mock.register('history', { kind: 'query', permission: Object.values(HISTORY_PERMISSION), run: history });
}
