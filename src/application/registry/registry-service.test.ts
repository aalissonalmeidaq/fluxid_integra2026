import { describe, expect, it, vi } from 'vitest';
import { RegistryService, type RegistryTransport } from './registry-service';

const ORG = '20000000-0000-4000-8000-00000000000a';

const transport = (status: number, body: unknown): RegistryTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => ({ status, body })) });
const service = (t: RegistryTransport, online = true) => new RegistryService(t, () => online);
const pickAll = (payload: Record<string, unknown>) => payload;

describe('RegistryService: sucesso e falhas de leitura e escrita', () => {
  it('devolve o valor escolhido por `pick` em 2xx', async () => {
    const t = transport(200, { code: 'LISTED', items: [] });
    const outcome = await service(t).query(ORG, 'list_customers', { search: 'alfa' }, pickAll);
    expect(outcome).toEqual({ kind: 'success', value: { code: 'LISTED', items: [] } });
    expect(t.call).toHaveBeenCalledWith('query-registry', { operation: 'list_customers', organization_id: ORG, search: 'alfa' });
  });

  it('campos undefined não vão ao servidor', async () => {
    const t = transport(200, { code: 'OK' });
    await service(t).command(ORG, 'create_vehicle', { plate: 'ABC1234', brand: undefined }, pickAll);
    expect(t.call).toHaveBeenCalledWith('manage-registry', { operation: 'create_vehicle', organization_id: ORG, plate: 'ABC1234' });
  });

  it('2xx que o pick não reconhece é falha, nunca sucesso (leitura: unavailable; escrita: unknown)', async () => {
    expect(await service(transport(200, { code: 'OK' })).query(ORG, 'x', {}, () => null)).toEqual({ kind: 'unavailable' });
    expect(await service(transport(200, { code: 'OK' })).command(ORG, 'x', {}, () => null)).toEqual({ kind: 'unknown' });
  });

  it('exceção do transporte vira unavailable em leitura e unknown em escrita', async () => {
    const quebrado: RegistryTransport = { call: vi.fn(async () => { throw new Error('rede'); }) };
    expect(await service(quebrado).query(ORG, 'x', {}, pickAll)).toEqual({ kind: 'unavailable' });
    expect(await service(quebrado).command(ORG, 'x', {}, pickAll)).toEqual({ kind: 'unknown' });
  });

  it('5xx e código desconhecido são falhas genéricas', async () => {
    expect(await service(transport(500, { code: 'INTERNAL_ERROR' })).query(ORG, 'x', {}, pickAll)).toEqual({ kind: 'unavailable' });
    expect(await service(transport(409, { code: 'NOVO' })).command(ORG, 'x', {}, pickAll)).toEqual({ kind: 'unknown' });
  });
});

describe('RegistryService: sem conexão nada é chamado nem enfileirado (RF-045)', () => {
  it('leitura e escrita devolvem offline sem tocar o transporte', async () => {
    const t = transport(200, { code: 'OK' });
    expect(await service(t, false).query(ORG, 'x', {}, pickAll)).toEqual({ kind: 'offline' });
    expect(await service(t, false).command(ORG, 'x', {}, pickAll)).toEqual({ kind: 'offline' });
    expect(t.call).not.toHaveBeenCalled();
  });
});

describe('RegistryService: mapeamento dos códigos do servidor', () => {
  it.each([
    ['AUTH_REQUIRED', 401, 'access_denied'], ['ACCESS_DENIED', 403, 'access_denied'], ['MFA_REQUIRED', 403, 'mfa_required'],
    ['NOT_FOUND', 404, 'not_found'], ['VALIDATION_FAILED', 400, 'invalid'], ['JUSTIFICATION_REQUIRED', 400, 'justification_required'],
    ['DOCUMENT_CONFLICT', 409, 'document_conflict'], ['PLATE_CONFLICT', 409, 'plate_conflict'], ['NAME_CONFLICT', 409, 'name_conflict'],
    ['VERSION_CONFLICT', 409, 'version_conflict'], ['ALREADY_INACTIVE', 409, 'already_inactive'], ['INACTIVE_RECORD', 409, 'inactive_record'],
    ['PARENT_INACTIVE', 409, 'parent_inactive'], ['CASCADE_CHANGED', 409, 'cascade_changed'], ['USER_NOT_ELIGIBLE', 409, 'user_not_eligible'],
    ['GEOMETRY_INVALID', 400, 'geometry_invalid'], ['ANONYMIZED_RECORD', 409, 'anonymized_record'], ['ALREADY_ANONYMIZED', 409, 'already_anonymized'],
    ['ACTIVE_RECORD', 409, 'active_record'], ['CONFIRMATION_REQUIRED', 400, 'confirmation_required'], ['RATE_LIMITED', 429, 'rate_limited'],
  ] as const)('%s vira %s', async (code, status, kind) => {
    const outcome = await service(transport(status, { code })).command(ORG, 'x', {}, pickAll);
    expect(outcome.kind).toBe(kind);
  });

  it('erros por campo, inclusive de itens de lista, chegam à tela', async () => {
    const outcome = await service(transport(400, { code: 'VALIDATION_FAILED', fields: [{ field: 'legal_name', message: 'Informe o nome.' }, { field: 'contacts.1.email', message: 'E-mail inválido.' }] }))
      .command(ORG, 'create_customer', {}, pickAll);
    expect(outcome).toEqual({ kind: 'invalid', fields: { legal_name: 'Informe o nome.', 'contacts.1.email': 'E-mail inválido.' } });
  });

  it('conflito de documento traz o cadastro existente pelo nome, nunca o documento', async () => {
    const outcome = await service(transport(409, { code: 'DOCUMENT_CONFLICT', entity_id: 'abc', owner_name: 'Hospital Alfa Ltda' })).command(ORG, 'create_customer', {}, pickAll);
    expect(outcome).toEqual({ kind: 'document_conflict', owner: { id: 'abc', label: 'Hospital Alfa Ltda' } });
    expect(JSON.stringify(outcome)).not.toMatch(/\d{11}/);
  });

  it('conflito de placa traz o veículo existente', async () => {
    const outcome = await service(transport(409, { code: 'PLATE_CONFLICT', vehicle_id: 'v1', plate: 'ABC1D23' })).command(ORG, 'create_vehicle', {}, pickAll);
    expect(outcome).toEqual({ kind: 'plate_conflict', owner: { id: 'v1', label: 'ABC1D23' } });
  });

  it('geometria inválida traz o motivo', async () => {
    const outcome = await service(transport(400, { code: 'GEOMETRY_INVALID', reason: 'self_intersection' })).command(ORG, 'create_geofence', {}, pickAll);
    expect(outcome).toEqual({ kind: 'geometry_invalid', geometryReason: 'self_intersection' });
  });

  it('cascata alterada traz as quantidades novas', async () => {
    const outcome = await service(transport(409, { code: 'CASCADE_CHANGED', counts: { sites: 3, geofences: 5 } })).command(ORG, 'inactivate_customer', {}, pickAll);
    expect(outcome).toEqual({ kind: 'cascade_changed', cascadeCounts: { sites: 3, geofences: 5 } });
  });

  it('limite de taxa traz o tempo para tentar de novo', async () => {
    const outcome = await service(transport(429, { code: 'RATE_LIMITED', retry_after_seconds: 42 })).command(ORG, 'x', {}, pickAll);
    expect(outcome).toEqual({ kind: 'rate_limited', retryAfterSeconds: 42 });
  });
});

describe('RegistryService: nada em armazenamento local (RF-046)', () => {
  it('não grava resposta em localStorage nem sessionStorage', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    await service(transport(200, { code: 'FOUND', customer: { id: 'x' } })).query(ORG, 'get_customer', { customer_id: 'x' }, pickAll);
    await service(transport(409, { code: 'DOCUMENT_CONFLICT', entity_id: 'x', owner_name: 'Nome' })).command(ORG, 'create_customer', {}, pickAll);
    expect(local).not.toHaveBeenCalled();
    local.mockRestore();
  });
});

describe('RegistryService: clientes e unidades (US1)', () => {
  const CUSTOMER = '81000000-0000-4000-8000-000000000001';
  const SITE = '82000000-0000-4000-8000-000000000001';
  const customerValue = {
    personType: 'legal' as const, document: '11222333000181', legalName: 'Hospital Alfa Ltda', tradeName: null, segment: 'hospital' as const, segmentDetail: null, notes: null,
    contacts: [{ name: 'Maria Souza', role: 'Compras', phone: '11912345678', email: 'maria@exemplo.invalid', isPrimary: true }],
  };
  const siteValue = {
    name: 'Unidade Central', postalCode: '01001000', street: 'Praça da Sé', number: '100', complement: null, district: 'Sé', city: 'São Paulo', state: 'SP' as const,
    ibgeCode: '3550308', latitude: null, longitude: null, receivingContactName: null, receivingContactPhone: null, receivingDays: [1, 2], receivingFrom: '08:00',
    receivingTo: '17:00', accessInstructions: null,
  };

  it('createCustomer envia os campos em snake_case e devolve o id e a versão', async () => {
    const t = transport(200, { code: 'CREATED', customer_id: CUSTOMER, version: 1 });
    expect(await service(t).createCustomer(ORG, customerValue)).toEqual({ kind: 'success', value: { id: CUSTOMER, version: 1 } });
    expect(t.call).toHaveBeenCalledWith('manage-registry', {
      operation: 'create_customer', organization_id: ORG, person_type: 'legal', document: '11222333000181', legal_name: 'Hospital Alfa Ltda', trade_name: null,
      segment: 'hospital', segment_detail: null, notes: null,
      contacts: [{ name: 'Maria Souza', role: 'Compras', phone: '11912345678', email: 'maria@exemplo.invalid', is_primary: true }],
    });
  });

  it('createCustomer: resposta de sucesso sem id ou versão não é tratada como sucesso', async () => {
    expect(await service(transport(200, { code: 'CREATED' })).createCustomer(ORG, customerValue)).toEqual({ kind: 'unknown' });
    expect(await service(transport(200, { code: 'UPDATED', customer_id: CUSTOMER, version: 1 })).createCustomer(ORG, customerValue)).toEqual({ kind: 'unknown' });
  });

  it('createCustomer: conflito de documento chega com o nome do cadastro existente', async () => {
    const outcome = await service(transport(409, { code: 'DOCUMENT_CONFLICT', entity_id: 'abc', owner_name: 'Hospital Alfa Ltda' })).createCustomer(ORG, customerValue);
    expect(outcome).toEqual({ kind: 'document_conflict', owner: { id: 'abc', label: 'Hospital Alfa Ltda' } });
  });

  it('updateCustomer não envia o tipo de pessoa nem o documento quando não mudaram, e omite os contatos não editados', async () => {
    const t = transport(200, { code: 'UPDATED', version: 3 });
    const outcome = await service(t).updateCustomer(ORG, CUSTOMER, 2, { legalName: 'Hospital Alfa Renomeado Ltda', tradeName: null, segment: 'hospital', segmentDetail: null, notes: null });
    expect(outcome).toEqual({ kind: 'success', value: { version: 3 } });
    const sent = t.call.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sent).toMatchObject({ operation: 'update_customer', customer_id: CUSTOMER, expected_version: 2, legal_name: 'Hospital Alfa Renomeado Ltda' });
    expect(Object.keys(sent)).not.toEqual(expect.arrayContaining(['person_type']));
    expect('document' in sent).toBe(false);
    expect('justification' in sent).toBe(false);
    expect('contacts' in sent).toBe(false);
  });

  it('updateCustomer envia o documento novo com a justificativa, e os contatos quando editados', async () => {
    const t = transport(200, { code: 'UPDATED', version: 4 });
    await service(t).updateCustomer(ORG, CUSTOMER, 3, {
      legalName: 'Hospital Alfa Ltda', tradeName: null, segment: 'hospital', segmentDetail: null, notes: null, document: '11222333000262', justification: 'Correção de digitação',
      contacts: [],
    });
    expect(t.call.mock.calls[0]?.[1]).toMatchObject({ document: '11222333000262', justification: 'Correção de digitação', contacts: [] });
  });

  it('updateCustomer: a justificativa sozinha, sem documento novo, não vai ao servidor', async () => {
    const t = transport(200, { code: 'UPDATED', version: 4 });
    await service(t).updateCustomer(ORG, CUSTOMER, 3, { legalName: 'Hospital Alfa Ltda', tradeName: null, segment: 'hospital', segmentDetail: null, notes: null, justification: 'sobra' });
    expect('justification' in (t.call.mock.calls[0]?.[1] as Record<string, unknown>)).toBe(false);
  });

  it('updateCustomer: conflito de versão e cliente inativo viram estados de tela', async () => {
    const value = { legalName: 'Nome Ok', tradeName: null, segment: 'hospital' as const, segmentDetail: null, notes: null };
    expect((await service(transport(409, { code: 'VERSION_CONFLICT' })).updateCustomer(ORG, CUSTOMER, 1, value)).kind).toBe('version_conflict');
    expect((await service(transport(409, { code: 'INACTIVE_RECORD' })).updateCustomer(ORG, CUSTOMER, 1, value)).kind).toBe('inactive_record');
    expect((await service(transport(400, { code: 'JUSTIFICATION_REQUIRED' })).updateCustomer(ORG, CUSTOMER, 1, value)).kind).toBe('justification_required');
  });

  it('createSite envia o endereço digitado e a janela de recebimento', async () => {
    const t = transport(200, { code: 'CREATED', site_id: SITE, version: 1 });
    expect(await service(t).createSite(ORG, CUSTOMER, siteValue)).toEqual({ kind: 'success', value: { id: SITE, version: 1 } });
    expect(t.call).toHaveBeenCalledWith('manage-registry', expect.objectContaining({
      operation: 'create_site', customer_id: CUSTOMER, name: 'Unidade Central', postal_code: '01001000', state: 'SP', receiving_days: [1, 2],
      receiving_from: '08:00', receiving_to: '17:00',
    }));
  });

  it('createSite: nome repetido e cliente pai inativo viram estados de tela', async () => {
    expect((await service(transport(409, { code: 'NAME_CONFLICT' })).createSite(ORG, CUSTOMER, siteValue)).kind).toBe('name_conflict');
    expect((await service(transport(409, { code: 'PARENT_INACTIVE' })).createSite(ORG, CUSTOMER, siteValue)).kind).toBe('parent_inactive');
  });

  it('updateSite envia a versão esperada e devolve a nova', async () => {
    const t = transport(200, { code: 'UPDATED', version: 2 });
    expect(await service(t).updateSite(ORG, SITE, 1, siteValue)).toEqual({ kind: 'success', value: { version: 2 } });
    expect(t.call.mock.calls[0]?.[1]).toMatchObject({ operation: 'update_site', site_id: SITE, expected_version: 1 });
  });

  it('sem conexão nenhum comando é enviado (RF-045)', async () => {
    const t = transport(200, { code: 'CREATED', customer_id: CUSTOMER, version: 1 });
    expect(await service(t, false).createCustomer(ORG, customerValue)).toEqual({ kind: 'offline' });
    expect(await service(t, false).createSite(ORG, CUSTOMER, siteValue)).toEqual({ kind: 'offline' });
    expect(t.call).not.toHaveBeenCalled();
  });
});
