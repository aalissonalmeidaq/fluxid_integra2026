import { describe, expect, it, vi } from 'vitest';
import { RegistryService, type RegistryTransport } from './registry-service';

// Cada operação do serviço chama a função certa com o corpo do contrato (snake_case, sem campos indefinidos) e só devolve sucesso
// quando a resposta do servidor tem o código esperado.

const ORG = '20000000-0000-4000-8000-00000000000a';

function setup(body: unknown, status = 200) {
  const call = vi.fn(async (_fn: string, _payload: Record<string, unknown>) => ({ status, body }));
  const transport: RegistryTransport = { call };
  return { call, service: new RegistryService(transport, () => true) };
}

const customerListItem = { id: 'c1', person_type: 'legal', document_display: 'x', legal_name: 'Alfa', segment: 'hospital', status: 'active' };
const customerDetail = { code: 'FOUND', customer: { ...customerListItem, version: 1 } };
const siteDetail = { code: 'FOUND', site: { id: 's1', customer_id: 'c1', name: 'Matriz', status: 'active', version: 1 } };
const geofenceRow = { id: 'g1', name: 'Portão', status: 'active', shape: 'circle', site_id: 's1' };
const vehicleRow = { id: 'v1', plate: 'ABC1D23', vehicle_type: 'truck', status: 'available', licensing_status: 'em_dia', capacity_cylinders: 10, version: 1 };
const driverRow = { id: 'd1', full_name: 'Maria', status: 'active', cnh_status: 'em_dia', version: 2, cnh_valid_until: '2027-01-01' };
const site = {
  name: 'Matriz', postalCode: '01001000', street: 'Praça da Sé', number: '1', complement: null, district: null, city: 'São Paulo', state: 'SP', ibgeCode: null,
  latitude: -23.5, longitude: -46.6, receivingContactName: null, receivingContactPhone: null, receivingDays: [1], receivingFrom: '08:00', receivingTo: '17:00', accessInstructions: null,
} as never;
const vehicle = { plate: 'ABC1D23', vehicleType: 'truck', vehicleTypeDetail: null, brand: null, model: null, manufactureYear: null, capacityCylinders: 10, maxLoadKg: null, licensingDueOn: null } as never;
const circle = { name: 'Portão', shape: 'circle', center: { lat: 1, lng: 2 }, radiusM: 100, vertices: [] } as never;
const polygon = { name: 'Pátio', shape: 'polygon', center: null, radiusM: null, vertices: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: 5, lng: 6 }] } as never;
const driver = { fullName: 'Maria', cpf: '52998224725', cnhNumber: '123', cnhCategory: 'D', cnhValidUntil: '2027-01-01', phone: null, justification: null } as never;
const anonymization = { reason: 'data_subject_request', justification: 'pedido do titular' } as const;

describe('RegistryService: clientes e unidades', () => {
  it('cria cliente com contatos no formato do servidor', async () => {
    const { call, service } = setup({ code: 'CREATED', customer_id: 'c1', version: 1 });
    const outcome = await service.createCustomer(ORG, {
      personType: 'legal', document: '11222333000181', legalName: 'Alfa', tradeName: null, segment: 'hospital', segmentDetail: null, notes: null,
      contacts: [{ name: 'Joana', role: 'Compras', phone: '1', email: 'a@b.c', isPrimary: true }],
    } as never);
    expect(outcome).toEqual({ kind: 'success', value: { id: 'c1', version: 1 } });
    expect(call).toHaveBeenCalledWith('manage-registry', expect.objectContaining({
      operation: 'create_customer', organization_id: ORG, legal_name: 'Alfa', contacts: [{ name: 'Joana', role: 'Compras', phone: '1', email: 'a@b.c', is_primary: true }],
    }));
  });

  it('atualiza cliente enviando documento e justificativa só quando há documento novo', async () => {
    const { call, service } = setup({ code: 'UPDATED', version: 2 });
    const base = { legalName: 'Alfa', tradeName: null, segment: 'hospital', segmentDetail: null, notes: null } as const;
    await service.updateCustomer(ORG, 'c1', 1, { ...base, document: '11222333000181', justification: 'erro de digitação', contacts: [] } as never);
    expect(call).toHaveBeenLastCalledWith('manage-registry', expect.objectContaining({ document: '11222333000181', justification: 'erro de digitação', contacts: [], expected_version: 1 }));
    await service.updateCustomer(ORG, 'c1', 1, { ...base, justification: 'ignorada' } as never);
    const body = call.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('document');
    expect(body).not.toHaveProperty('justification');
    expect(body).not.toHaveProperty('contacts');
    await service.updateCustomer(ORG, 'c1', 1, { ...base, document: '123' } as never);
    expect(call.mock.calls.at(-1)?.[1]).not.toHaveProperty('justification');
  });

  it('cria e atualiza unidade, com a origem das coordenadas só quando informada', async () => {
    const created = setup({ code: 'CREATED', site_id: 's1', version: 1 });
    expect(await created.service.createSite(ORG, 'c1', site)).toEqual({ kind: 'success', value: { id: 's1', version: 1 } });
    expect(created.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'create_site', customer_id: 'c1', postal_code: '01001000', receiving_days: [1] });
    expect(created.call.mock.calls[0]?.[1]).not.toHaveProperty('coordinates_source');
    const updated = setup({ code: 'UPDATED', version: 3 });
    expect(await updated.service.updateSite(ORG, 's1', 2, { ...(site as object), coordinatesSource: 'geocoded' } as never)).toEqual({ kind: 'success', value: { version: 3 } });
    expect(updated.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'update_site', site_id: 's1', expected_version: 2, coordinates_source: 'geocoded' });
  });

  it('lista clientes e unidades com filtros normalizados', async () => {
    const customers = setup({ code: 'LISTED', items: [customerListItem], total: 1 });
    const page = await customers.service.listCustomers(ORG, { search: '  alfa  ', status: 'active', segment: 'hospital', state: 'SP', hasGeofence: true, cursor: 'c', limit: 20 });
    expect(page).toMatchObject({ kind: 'success', value: { total: 1 } });
    expect(customers.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'list_customers', search: 'alfa', segment: 'hospital', state: 'SP', has_geofence: true, cursor: 'c', limit: 20 });
    await customers.service.listCustomers(ORG, { search: '   ', segment: '', state: '' });
    const empty = customers.call.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(empty).not.toHaveProperty('search');
    expect(empty).not.toHaveProperty('segment');
    const sites = setup({ code: 'LISTED', items: [{ id: 's1', customer_id: 'c1', name: 'Matriz', status: 'active' }] });
    expect(await sites.service.listSites(ORG, { customerId: 'c1' })).toMatchObject({ kind: 'success' });
    expect(sites.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'list_sites', customer_id: 'c1' });
  });

  it('lê detalhes e pontos, e uma resposta fora do contrato vira indisponível', async () => {
    expect(await setup(customerDetail).service.getCustomer(ORG, 'c1')).toMatchObject({ kind: 'success' });
    expect(await setup(siteDetail).service.getSite(ORG, 's1')).toMatchObject({ kind: 'success' });
    const points = setup({ code: 'FOUND', items: [], total: 0 });
    expect(await points.service.listSitePoints(ORG)).toEqual({ kind: 'success', value: { items: [], total: 0 } });
    expect(points.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'list_site_points', limit: 500 });
    await points.service.listSitePoints(ORG, 50);
    expect(points.call.mock.calls[1]?.[1]).toMatchObject({ limit: 50 });
    expect(await setup({ code: 'LISTED', items: 'x' }).service.listCustomers(ORG, {})).toEqual({ kind: 'unavailable' });
  });
});

describe('RegistryService: geocercas', () => {
  it('lista e lê geocercas', async () => {
    const list = setup({ code: 'LISTED', items: [geofenceRow] });
    expect(await list.service.listGeofences(ORG, { siteId: 's1', customerId: 'c1', shape: 'circle' })).toMatchObject({ kind: 'success' });
    expect(list.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'list_geofences', site_id: 's1', customer_id: 'c1', shape: 'circle' });
    await list.service.listGeofences(ORG, { customerId: '', shape: '' });
    expect(list.call.mock.calls[1]?.[1]).not.toHaveProperty('shape');
    const one = setup({ code: 'FOUND', geofence: { ...geofenceRow, version: 1, center: { lat: 1, lng: 2 }, radius_m: 100 } });
    expect(await one.service.getGeofence(ORG, 'g1')).toMatchObject({ kind: 'success', value: { radiusM: 100 } });
  });

  it('cria círculo e polígono e devolve as sobreposições', async () => {
    const created = setup({ code: 'CREATED', geofence_id: 'g1', version: 1, overlaps: [{ id: 'g2', name: 'Outra' }] });
    expect(await created.service.createGeofence(ORG, 's1', circle)).toEqual({ kind: 'success', value: { id: 'g1', version: 1, overlaps: [{ id: 'g2', name: 'Outra' }] } });
    expect(created.call.mock.calls[0]?.[1]).toMatchObject({ shape: 'circle', center: { lat: 1, lng: 2 }, radius_m: 100 });
    await created.service.createGeofence(ORG, 's1', polygon);
    expect(created.call.mock.calls[1]?.[1]).toMatchObject({ shape: 'polygon' });
    expect(created.call.mock.calls[1]?.[1]).not.toHaveProperty('radius_m');
    const updated = setup({ code: 'UPDATED', version: 2 });
    expect(await updated.service.updateGeofence(ORG, 'g1', 1, circle)).toEqual({ kind: 'success', value: { version: 2, overlaps: [] } });
    expect(await setup({ code: 'OTHER' }).service.updateGeofence(ORG, 'g1', 1, circle)).toEqual({ kind: 'unknown' });
  });

  it('testa um ponto: a decisão vem do servidor e resposta sem booleano é indisponível', async () => {
    const inside = setup({ code: 'FOUND', inside: true });
    expect(await inside.service.pointInGeofence(ORG, 'g1', 1, 2)).toEqual({ kind: 'success', value: true });
    expect(inside.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'point_in_geofence', latitude: 1, longitude: 2 });
    expect(await setup({ code: 'FOUND', inside: 'sim' }).service.pointInGeofence(ORG, 'g1', 1, 2)).toEqual({ kind: 'unavailable' });
  });
});

describe('RegistryService: veículos e motoristas', () => {
  it('lista, lê, cria e atualiza veículos', async () => {
    const list = setup({ code: 'LISTED', items: [vehicleRow] });
    expect(await list.service.listVehicles(ORG, { search: ' abc ', vehicleType: 'truck', licensingStatus: 'em_dia', sort: 'plate_desc', status: 'available' })).toMatchObject({ kind: 'success' });
    expect(list.call.mock.calls[0]?.[1]).toMatchObject({ search: 'abc', vehicle_type: 'truck', licensing_status: 'em_dia', sort: 'plate_desc', status: 'available' });
    expect(await setup({ code: 'FOUND', vehicle: vehicleRow }).service.getVehicle(ORG, 'v1')).toMatchObject({ kind: 'success', value: { plate: 'ABC1D23' } });
    const created = setup({ code: 'CREATED', vehicle_id: 'v1', version: 1 });
    expect(await created.service.createVehicle(ORG, vehicle)).toEqual({ kind: 'success', value: { id: 'v1', version: 1 } });
    const updated = setup({ code: 'UPDATED', version: 2 });
    await updated.service.updateVehicle(ORG, 'v1', 1, vehicle, 'troca de placa');
    expect(updated.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'update_vehicle', justification: 'troca de placa' });
    await updated.service.updateVehicle(ORG, 'v1', 1, vehicle, null);
    expect(updated.call.mock.calls[1]?.[1]).not.toHaveProperty('justification');
  });

  it('muda a situação do veículo só com o código STATUS_CHANGED', async () => {
    const changed = setup({ code: 'STATUS_CHANGED', version: 4 });
    expect(await changed.service.changeVehicleStatus(ORG, 'v1', 3, 'maintenance', 'revisão')).toEqual({ kind: 'success', value: { version: 4 } });
    expect(changed.call.mock.calls[0]?.[1]).toMatchObject({ status: 'maintenance', justification: 'revisão', expected_version: 3 });
    expect(await setup({ code: 'UPDATED', version: 4 }).service.changeVehicleStatus(ORG, 'v1', 3, 'available', null)).toEqual({ kind: 'unknown' });
  });

  it('lista, lê, cria e atualiza motoristas', async () => {
    const list = setup({ code: 'LISTED', items: [driverRow] });
    expect(await list.service.listDrivers(ORG, { cnhStatus: 'vencido', linked: false, sort: 'name_desc' })).toMatchObject({ kind: 'success' });
    expect(list.call.mock.calls[0]?.[1]).toMatchObject({ cnh_status: 'vencido', linked: false, sort: 'name_desc' });
    expect(await setup({ code: 'FOUND', driver: driverRow }).service.getDriver(ORG, 'd1')).toMatchObject({ kind: 'success' });
    const created = setup({ code: 'CREATED', driver_id: 'd1', version: 1 });
    expect(await created.service.createDriver(ORG, driver)).toEqual({ kind: 'success', value: { id: 'd1', version: 1 } });
    expect(created.call.mock.calls[0]?.[1]).toMatchObject({ full_name: 'Maria', cnh_number: '123' });
    const updated = setup({ code: 'UPDATED', version: 3 });
    await updated.service.updateDriver(ORG, 'd1', 2, { ...(driver as object), cpf: null, cnhNumber: null } as never);
    const body = updated.call.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('cpf');
    expect(body).not.toHaveProperty('cnh_number');
  });

  it('vincula, desvincula e lista usuários vinculáveis', async () => {
    const link = setup({ code: 'LINKED', version: 5 });
    expect(await link.service.linkDriverUser(ORG, 'd1', 'u1')).toEqual({ kind: 'success', value: { version: 5 } });
    expect(await setup({ code: 'LINKED' }).service.linkDriverUser(ORG, 'd1', 'u1')).toEqual({ kind: 'success', value: { version: 0 } });
    expect(await setup({ code: 'UNLINKED', version: 6 }).service.unlinkDriverUser(ORG, 'd1', 'saiu')).toEqual({ kind: 'success', value: { version: 6 } });
    expect(await setup({ code: 'LINKED' }).service.unlinkDriverUser(ORG, 'd1', 'saiu')).toEqual({ kind: 'unknown' });
    const users = setup({ code: 'LISTED', users: [{ id: 'u1', display_name: 'Ana' }] });
    expect(await users.service.listLinkableUsers(ORG, ' an ')).toEqual({ kind: 'success', value: [{ id: 'u1', displayName: 'Ana' }] });
    expect(users.call.mock.calls[0]?.[1]).toMatchObject({ search: 'an', limit: 100 });
    await users.service.listLinkableUsers(ORG);
    expect(users.call.mock.calls[1]?.[1]).not.toHaveProperty('search');
  });

  it('revela o documento só com o código REVEALED e valor em texto', async () => {
    const revealed = setup({ code: 'REVEALED', value: '52998224725' });
    expect(await revealed.service.revealDocument(ORG, 'driver', 'd1', 'cpf')).toEqual({ kind: 'success', value: '52998224725' });
    expect(revealed.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'reveal_document', entity_type: 'driver', document: 'cpf' });
    expect(await setup({ code: 'REVEALED', value: 5 }).service.revealDocument(ORG, 'customer', 'c1', 'cnh')).toEqual({ kind: 'unknown' });
  });
});

describe('RegistryService: inativação, histórico e anonimização', () => {
  it('mostra a prévia da cascata e a confirma com as quantidades esperadas', async () => {
    const preview = setup({ code: 'FOUND', sites: 2, geofences: 3 });
    expect(await preview.service.previewCustomerInactivation(ORG, 'c1')).toEqual({ kind: 'success', value: { sites: 2, geofences: 3 } });
    expect(await setup({ code: 'FOUND' }).service.previewSiteInactivation(ORG, 's1')).toEqual({ kind: 'success', value: { sites: 0, geofences: 0 } });
    expect(await setup({ code: 'NOT_FOUND' }).service.previewSiteInactivation(ORG, 's1')).toEqual({ kind: 'unavailable' });
    const inactivate = setup({ code: 'INACTIVATED', version: 7 });
    expect(await inactivate.service.inactivateCustomer(ORG, 'c1', 'encerrou', { sites: 2, geofences: 3 })).toEqual({ kind: 'success', value: { version: 7 } });
    expect(inactivate.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'inactivate_customer', expected_counts: { sites: 2, geofences: 3 } });
    await inactivate.service.inactivateSite(ORG, 's1', 'fechou', { sites: 0, geofences: 1 });
    expect(inactivate.call.mock.calls[1]?.[1]).toMatchObject({ operation: 'inactivate_site', expected_counts: { geofences: 1 } });
  });

  it.each([
    ['reactivateCustomer', 'reactivate_customer', 'REACTIVATED'], ['reactivateSite', 'reactivate_site', 'REACTIVATED'], ['inactivateGeofence', 'inactivate_geofence', 'INACTIVATED'],
    ['reactivateGeofence', 'reactivate_geofence', 'REACTIVATED'], ['inactivateDriver', 'inactivate_driver', 'INACTIVATED'], ['reactivateDriver', 'reactivate_driver', 'REACTIVATED'],
  ] as const)('%s chama %s e só aceita %s', async (method, operation, code) => {
    const ok = setup({ code, version: 9 });
    const result = await (ok.service[method] as (org: string, id: string, justification: string) => Promise<unknown>)(ORG, 'id-1', 'motivo');
    expect(result).toEqual({ kind: 'success', value: { version: 9 } });
    expect(ok.call.mock.calls[0]?.[1]).toMatchObject({ operation, justification: 'motivo' });
    const wrong = setup({ code: code === 'INACTIVATED' ? 'REACTIVATED' : 'INACTIVATED' });
    expect(await (wrong.service[method] as (org: string, id: string, justification: string) => Promise<unknown>)(ORG, 'id-1', 'motivo')).toEqual({ kind: 'unknown' });
  });

  it('lê o histórico com filtros e ordem', async () => {
    const history = setup({ code: 'LISTED', events: [{ id: 'e1', sequence: 1, event_type: 'site_created', occurred_at: '2026-10-07T10:00:00Z' }], next: null });
    const outcome = await history.service.history(ORG, 'site', 's1', { eventType: 'site_created', from: '2026-10-01', to: '2026-10-08', order: 'desc', cursor: 'c', limit: 10 });
    expect(outcome).toMatchObject({ kind: 'success', value: { events: [{ eventType: 'site_created' }], next: null } });
    expect(history.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'history', entity_type: 'site', event_type: 'site_created', order: 'desc', cursor: 'c', limit: 10 });
    await history.service.history(ORG, 'driver', 'd1', { eventType: '', from: '', to: '' });
    expect(history.call.mock.calls[1]?.[1]).not.toHaveProperty('event_type');
    expect(history.call.mock.calls[1]?.[1]).not.toHaveProperty('from');
  });

  it.each([
    ['anonymizeDriver', 'anonymize_driver', 'driver_id'], ['anonymizeCustomer', 'anonymize_customer', 'customer_id'],
  ] as const)('%s exige a confirmação explícita no corpo e devolve o instante', async (method, operation, idField) => {
    const ok = setup({ code: 'ANONYMIZED', anonymized_at: '2026-10-08T12:00:00Z' });
    expect(await ok.service[method](ORG, 'id-1', 4, anonymization)).toEqual({ kind: 'success', value: { anonymizedAt: '2026-10-08T12:00:00Z' } });
    expect(ok.call.mock.calls[0]?.[1]).toMatchObject({ operation, [idField]: 'id-1', expected_version: 4, reason: 'data_subject_request', confirmed: true });
  });

  it('anonimiza contato e recusa resposta sem instante', async () => {
    const ok = setup({ code: 'ANONYMIZED', anonymized_at: '2026-10-08T12:00:00Z' });
    expect(await ok.service.anonymizeContact(ORG, 'k1', anonymization)).toMatchObject({ kind: 'success' });
    expect(ok.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'anonymize_contact', contact_id: 'k1', confirmed: true });
    expect(await setup({ code: 'ANONYMIZED' }).service.anonymizeContact(ORG, 'k1', anonymization)).toEqual({ kind: 'unknown' });
  });
});

describe('RegistryService: detalhes das falhas do servidor', () => {
  it('traz os campos inválidos por nome, ignorando entradas malformadas', async () => {
    const { service } = setup({ code: 'VALIDATION_FAILED', fields: [{ field: 'name', message: 'Obrigatório' }, { field: 3, message: 'x' }, 'x'] }, 400);
    expect(await service.createVehicle(ORG, vehicle)).toEqual({ kind: 'invalid', fields: { name: 'Obrigatório' } });
  });

  it('traz o cadastro dono do conflito, o campo do documento e a geometria inválida', async () => {
    expect(await setup({ code: 'DOCUMENT_CONFLICT', entity_id: 'c9', owner_name: 'Alfa', field: 'cpf' }, 409).service.createDriver(ORG, driver))
      .toEqual({ kind: 'document_conflict', owner: { id: 'c9', label: 'Alfa' }, conflictField: 'cpf' });
    expect(await setup({ code: 'PLATE_CONFLICT', vehicle_id: 'v9', plate: 'ABC1D23' }, 409).service.createVehicle(ORG, vehicle))
      .toEqual({ kind: 'plate_conflict', owner: { id: 'v9', label: 'ABC1D23' } });
    expect(await setup({ code: 'NAME_CONFLICT', owner_id: 'x' }, 409).service.createSite(ORG, 'c1', site)).toEqual({ kind: 'name_conflict', owner: { id: 'x', label: '' } });
    expect(await setup({ code: 'GEOMETRY_INVALID', reason: 'self_intersection' }, 400).service.createGeofence(ORG, 's1', polygon)).toEqual({ kind: 'geometry_invalid', geometryReason: 'self_intersection' });
  });

  it('traz as quantidades novas da cascata e o tempo de espera do limite', async () => {
    expect(await setup({ code: 'CASCADE_CHANGED', counts: { sites: 4 } }, 409).service.inactivateCustomer(ORG, 'c1', 'x', { sites: 2, geofences: 3 }))
      .toEqual({ kind: 'cascade_changed', cascadeCounts: { sites: 4, geofences: 0 } });
    expect(await setup({ code: 'RATE_LIMITED', retry_after_seconds: 12 }, 429).service.revealDocument(ORG, 'driver', 'd1', 'cpf')).toEqual({ kind: 'rate_limited', retryAfterSeconds: 12 });
    expect(await setup({ code: 'RATE_LIMITED' }, 429).service.revealDocument(ORG, 'driver', 'd1', 'cpf')).toEqual({ kind: 'rate_limited', retryAfterSeconds: 60 });
  });
});
