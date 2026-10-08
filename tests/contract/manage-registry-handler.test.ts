// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageRegistryHandler, MANAGE_OPERATIONS } from '../../supabase/functions/manage-registry/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 007, US1: manage-registry com clientes e unidades (RF-001 a RF-007, RF-033, RF-053, CA-002). O banco é sempre falso.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-000000000001';
const SITE = '82000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'CREATED' }, overrides: Partial<OperationsGateway> = {}): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
  ...overrides,
}) as never;

const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const body = (response: Response) => response.json() as Promise<Record<string, unknown>>;
const handler = (gw: Gateway) => createManageRegistryHandler(gw);

const customer = { operation: 'create_customer', organization_id: ORG, person_type: 'legal', document: '11.222.333/0001-81', legal_name: 'Hospital Alfa Ltda', segment: 'hospital' };
const site = {
  operation: 'create_site', organization_id: ORG, customer_id: CUSTOMER, name: 'Unidade Central', postal_code: '01001000', street: 'Praça da Sé', number: '100', city: 'São Paulo', state: 'SP',
};

describe('manage-registry: borda comum', () => {
  it('só aceita POST e responde ao preflight', async () => {
    expect((await handler(gateway())(post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await handler(gateway())(new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
  });

  it('sem token ou com token inválido: 401 e nenhuma chamada ao banco', async () => {
    const gw = gateway();
    expect((await handler(gw)(post(customer, ''))).status).toBe(401);
    const invalid = gateway({}, { authenticate: vi.fn(async () => null) });
    expect((await handler(invalid)(post(customer))).status).toBe(401);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(invalid.rpc).not.toHaveBeenCalled();
  });

  it('corpo inválido ou organização que não é UUID: 400', async () => {
    const gw = gateway();
    expect((await handler(gw)(new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'não é json' }))).status).toBe(400);
    expect((await handler(gw)(post({ ...customer, organization_id: 'abc' }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('ator, sessão e organização vêm do token e do corpo conferido pelo banco, nunca de campos extras', async () => {
    const gw = gateway();
    await handler(gw)(post({ ...customer, actor: 'outro', p_actor: 'outro', user_id: 'outro', session_id: 'outra' }));
    const [name, args] = gw.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('create_customer');
    expect(args.p_actor).toBe(USER);
    expect(args.p_session).toBe(SESSION);
    expect(args.p_organization).toBe(ORG);
    expect(JSON.stringify(args)).not.toContain('outro');
  });
});

describe('manage-registry: nenhuma exclusão existe (RF-033, CA-002)', () => {
  it.each(['delete_customer', 'delete_site', 'delete', 'remove_customer', 'purge', 'truncate', 'constructor', '__proto__'])('operação %s é recusada e auditada como negada', async (operation) => {
    const gw = gateway();
    const response = await handler(gw)(post({ operation, organization_id: ORG, customer_id: CUSTOMER }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'registry.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('nenhum nome de operação ou de RPC do catálogo sugere exclusão', () => {
    for (const [operation, spec] of Object.entries(MANAGE_OPERATIONS)) {
      expect(operation).not.toMatch(/delete|remove|purge|drop|truncate/);
      expect(spec.rpc).not.toMatch(/delete|remove|purge|drop|truncate/);
    }
  });
});

describe('manage-registry: cliente', () => {
  it('cria o cliente e entrega os argumentos nomeados ao banco', async () => {
    const gw = gateway({ code: 'CREATED', customer_id: CUSTOMER, version: 1 });
    const response = await handler(gw)(post({
      ...customer, trade_name: 'Alfa', segment_detail: null, notes: 'ok',
      contacts: [{ name: 'Maria Souza', role: 'Compras', phone: '11912345678', email: 'maria@exemplo.invalid', is_primary: true }],
    }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('create_customer', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_person_type: 'legal', p_document: '11.222.333/0001-81', p_legal_name: 'Hospital Alfa Ltda',
      p_trade_name: 'Alfa', p_segment: 'hospital', p_segment_detail: null, p_notes: 'ok',
      p_contacts: [{ name: 'Maria Souza', role: 'Compras', phone: '11912345678', email: 'maria@exemplo.invalid', is_primary: true }],
    });
  });

  it('campos opcionais ausentes viram nulo, e a lista de contatos ausente também', async () => {
    const gw = gateway();
    await handler(gw)(post(customer));
    expect(gw.rpc.mock.calls[0]?.[1]).toMatchObject({ p_trade_name: null, p_segment_detail: null, p_notes: null, p_contacts: null });
  });

  it.each([
    ['tipo de pessoa fora da lista', { person_type: 'x' }, 'person_type'],
    ['documento ausente', { document: undefined }, 'document'],
    ['razão social ausente', { legal_name: undefined }, 'legal_name'],
    ['razão social com mais de 160 caracteres', { legal_name: 'x'.repeat(161) }, 'legal_name'],
    ['nome fantasia com mais de 160 caracteres', { trade_name: 'x'.repeat(161) }, 'trade_name'],
    ['segmento fora da lista', { segment: 'x' }, 'segment'],
    ['detalhe do segmento com mais de 60 caracteres', { segment_detail: 'x'.repeat(61) }, 'segment_detail'],
    ['observações com mais de 500 caracteres', { notes: 'x'.repeat(501) }, 'notes'],
    ['contatos que não são lista', { contacts: 'x' }, 'contacts'],
    ['mais de 10 contatos', { contacts: Array.from({ length: 11 }, (_, i) => ({ name: `Contato ${i}` })) }, 'contacts'],
    ['contato sem nome', { contacts: [{ role: 'Compras' }] }, 'contacts.0.name'],
    ['segundo contato com função longa', { contacts: [{ name: 'Maria' }, { name: 'João', role: 'x'.repeat(81) }] }, 'contacts.1.role'],
  ] as const)('recusa: %s', async (_nome, extra, campo) => {
    const gw = gateway();
    const response = await handler(gw)(post({ ...customer, ...extra }));
    expect(response.status).toBe(400);
    expect(((await body(response)).fields as Array<{ field: string }>).map((f) => f.field)).toContain(campo);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('edita com a versão esperada e, se o documento mudar, com a justificativa', async () => {
    const gw = gateway({ code: 'UPDATED', version: 3 });
    await handler(gw)(post({
      operation: 'update_customer', organization_id: ORG, customer_id: CUSTOMER, expected_version: 2, legal_name: 'Hospital Alfa Renomeado Ltda', segment: 'hospital',
      document: '11.222.333/0002-62', justification: 'Correção de digitação',
    }));
    expect(gw.rpc).toHaveBeenCalledWith('update_customer', expect.objectContaining({
      p_customer: CUSTOMER, p_expected_version: 2, p_document: '11.222.333/0002-62', p_justification: 'Correção de digitação', p_contacts: null,
    }));
  });

  it.each([[0], [-1], [1.5], ['2'], [null]])('versão esperada %j é recusada', async (versao) => {
    const gw = gateway();
    const response = await handler(gw)(post({ operation: 'update_customer', organization_id: ORG, customer_id: CUSTOMER, expected_version: versao, legal_name: 'Nome Ok', segment: 'hospital' }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});

describe('manage-registry: unidade', () => {
  it('cria a unidade com todos os campos opcionais e entrega os argumentos ao banco', async () => {
    const gw = gateway({ code: 'CREATED', site_id: SITE, version: 1 });
    const response = await handler(gw)(post({
      ...site, complement: 'Sala 2', district: 'Sé', ibge_code: '3550308', latitude: -23.55052, longitude: -46.633308, receiving_contact_name: 'Responsável',
      receiving_contact_phone: '11912345678', receiving_days: [1, 2, 3], receiving_from: '08:00', receiving_to: '17:30', access_instructions: 'Portão azul',
    }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('create_site', expect.objectContaining({
      p_customer: CUSTOMER, p_name: 'Unidade Central', p_postal_code: '01001000', p_state: 'SP', p_latitude: -23.55052, p_longitude: -46.633308,
      p_receiving_days: [1, 2, 3], p_receiving_from: '08:00', p_receiving_to: '17:30', p_access_instructions: 'Portão azul',
    }));
  });

  it('entrega ao banco a origem das coordenadas confirmada pela pessoa (RF-065)', async () => {
    const gw = gateway({ code: 'CREATED', site_id: SITE, version: 1 });
    await handler(gw)(post({ ...site, latitude: -23.55, longitude: -46.63, coordinates_source: 'geocoded' }));
    expect(gw.rpc).toHaveBeenCalledWith('create_site', expect.objectContaining({ p_coordinates_source: 'geocoded' }));
  });

  it.each([['satelite'], [1], ['']])('origem de coordenadas inválida %j é recusada antes do banco', async (source) => {
    const gw = gateway({ code: 'CREATED', site_id: SITE, version: 1 });
    const response = await handler(gw)(post({ ...site, latitude: -23.55, longitude: -46.63, coordinates_source: source }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('o conflito de nome volta como 409 com o corpo do banco', async () => {
    const response = await handler(gateway({ code: 'NAME_CONFLICT' }))(post(site));
    expect(response.status).toBe(409);
    expect((await body(response)).code).toBe('NAME_CONFLICT');
  });

  it('cliente pai inativo volta como 409 PARENT_INACTIVE', async () => {
    expect((await handler(gateway({ code: 'PARENT_INACTIVE' }))(post(site))).status).toBe(409);
  });

  it.each([
    ['CEP com 7 dígitos', { postal_code: '0100100' }, 'postal_code'],
    ['CEP com hífen (a tela envia só dígitos)', { postal_code: '01001-000' }, 'postal_code'],
    ['UF em minúsculas', { state: 'sp' }, 'state'],
    ['UF com 3 letras', { state: 'SPP' }, 'state'],
    ['IBGE com 3 dígitos', { ibge_code: '123' }, 'ibge_code'],
    ['latitude acima de 90', { latitude: 91, longitude: 0 }, 'latitude'],
    ['longitude abaixo de -180', { latitude: 0, longitude: -181 }, 'longitude'],
    ['telefone do responsável com 9 dígitos', { receiving_contact_phone: '119123456' }, 'receiving_contact_phone'],
    ['dia da semana 7', { receiving_days: [7] }, 'receiving_days'],
    ['dias repetidos', { receiving_days: [1, 1] }, 'receiving_days'],
    ['horário em formato inválido', { receiving_from: '8h' }, 'receiving_from'],
    ['instruções com mais de 500 caracteres', { access_instructions: 'x'.repeat(501) }, 'access_instructions'],
    ['logradouro ausente', { street: undefined }, 'street'],
    ['nome com mais de 120 caracteres', { name: 'x'.repeat(121) }, 'name'],
  ] as const)('recusa: %s', async (_nome, extra, campo) => {
    const gw = gateway();
    const response = await handler(gw)(post({ ...site, ...extra }));
    expect(response.status).toBe(400);
    expect(((await body(response)).fields as Array<{ field: string }>).map((f) => f.field)).toContain(campo);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('edita a unidade com a versão esperada', async () => {
    const gw = gateway({ code: 'UPDATED', version: 2 });
    await handler(gw)(post({ ...site, operation: 'update_site', site_id: SITE, customer_id: undefined, expected_version: 1 }));
    expect(gw.rpc).toHaveBeenCalledWith('update_site', expect.objectContaining({ p_site: SITE, p_expected_version: 1 }));
  });
});

describe('manage-registry: negações e falhas do banco', () => {
  it('ACCESS_DENIED e AUTH_REQUIRED do banco são auditados como negados, sem alvo', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    const response = await handler(gw)(post(customer));
    expect(response.status).toBe(403);
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'customer.create', result: 'denied', reason: 'permission_denied' });
  });

  it.each([['NOT_FOUND', 404], ['VERSION_CONFLICT', 409], ['DOCUMENT_CONFLICT', 409], ['INACTIVE_RECORD', 409], ['JUSTIFICATION_REQUIRED', 400]] as const)('%s vira %s', async (code, status) => {
    const response = await handler(gateway({ code }))(post(customer));
    expect(response.status).toBe(status);
    expect((await body(response)).code).toBe(code);
  });

  it('falha do banco vira 500 sem detalhe e é auditada como falha', async () => {
    const gw = gateway({}, { rpc: vi.fn(async () => { throw new Error('rpc_failed'); }) });
    const response = await handler(gw)(post(customer));
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ code: 'INTERNAL_ERROR' });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'customer.create', result: 'failed', reason: 'internal_error' });
  });

  it('o corpo da requisição nunca é repassado à auditoria da borda', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await handler(gw)(post({ ...customer, document: '11222333000181' }));
    expect(JSON.stringify(gw.audit.mock.calls)).not.toMatch(/11222333000181|Hospital Alfa/);
  });
});

describe('manage-registry: geocerca (US3)', () => {
  const GEOFENCE = '84000000-0000-4000-8000-000000000001';
  const circle = { operation: 'create_geofence', organization_id: ORG, site_id: SITE, name: 'Portão', shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radius_m: 200 };

  it('cria um círculo e entrega os argumentos nomeados, com vértices nulos', async () => {
    const gw = gateway({ code: 'CREATED', geofence_id: GEOFENCE, version: 1, overlaps: [] });
    const response = await handler(gw)(post(circle));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('create_geofence', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_site: SITE, p_name: 'Portão', p_shape: 'circle', p_center: { lat: -23.55, lng: -46.633 },
      p_radius_m: 200, p_vertices: null,
    });
  });

  it('cria um polígono com vértices e edita com a versão esperada', async () => {
    const gw = gateway({ code: 'UPDATED', version: 2, overlaps: [] });
    const vertices = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }];
    await handler(gw)(post({ operation: 'update_geofence', organization_id: ORG, geofence_id: GEOFENCE, expected_version: 1, name: 'Pátio', shape: 'polygon', vertices }));
    expect(gw.rpc).toHaveBeenCalledWith('update_geofence', expect.objectContaining({ p_geofence: GEOFENCE, p_expected_version: 1, p_shape: 'polygon', p_vertices: vertices, p_center: null, p_radius_m: null }));
  });

  it.each([
    ['forma fora da lista', { shape: 'x' }, 'shape'],
    ['nome longo', { name: 'x'.repeat(121) }, 'name'],
    ['centro com latitude fora do intervalo', { center: { lat: 91, lng: 0 } }, 'center.lat'],
    ['raio decimal', { radius_m: 10.5 }, 'radius_m'],
    ['vértice sem longitude', { shape: 'polygon', vertices: [{ lat: 0 }] }, 'vertices.0.lng'],
    ['unidade que não é UUID', { site_id: 'x' }, 'site_id'],
  ] as const)('recusa: %s', async (_nome, extra, campo) => {
    const gw = gateway();
    const response = await handler(gw)(post({ ...circle, ...extra }));
    expect(response.status).toBe(400);
    expect(((await body(response)).fields as Array<{ field: string }>).map((f) => f.field)).toContain(campo);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('devolve o motivo da geometria inválida com 400', async () => {
    const response = await handler(gateway({ code: 'GEOMETRY_INVALID', reason: 'self_intersection' }))(post(circle));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ code: 'GEOMETRY_INVALID', reason: 'self_intersection' });
  });
});
