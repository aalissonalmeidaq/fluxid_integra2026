// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryRegistryHandler, QUERY_OPERATIONS } from '../../supabase/functions/query-registry/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 007, US2: query-registry com clientes e unidades (RF-040, RF-052). O banco é sempre falso.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'LISTED', items: [], total: 0, next: null }, overrides: Partial<OperationsGateway> = {}): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
  ...overrides,
}) as never;

const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const handler = (gw: Gateway) => createQueryRegistryHandler(gw);

describe('query-registry: borda comum', () => {
  it('só aceita POST e responde ao preflight', async () => {
    expect((await handler(gateway())(post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await handler(gateway())(new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
  });

  it('sem token ou com token inválido: 401 e nenhuma chamada ao banco', async () => {
    const gw = gateway();
    expect((await handler(gw)(post({ operation: 'list_customers', organization_id: ORG }, ''))).status).toBe(401);
    const invalid = gateway({}, { authenticate: vi.fn(async () => null) });
    expect((await handler(invalid)(post({ operation: 'list_customers', organization_id: ORG }))).status).toBe(401);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(invalid.rpc).not.toHaveBeenCalled();
  });

  it('operação desconhecida: 400 e auditoria de negação, sem chamar o banco', async () => {
    const gw = gateway();
    expect((await handler(gw)(post({ operation: 'delete_customer', organization_id: ORG }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'registry.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('corpo inválido e organização que não é UUID: 400', async () => {
    const gw = gateway();
    expect((await handler(gw)(new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'não é json' }))).status).toBe(400);
    expect((await handler(gw)(post({ operation: 'list_customers', organization_id: 'abc' }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('o ator e a sessão vêm do token, nunca de campos do corpo', async () => {
    const gw = gateway();
    await handler(gw)(post({ operation: 'list_customers', organization_id: ORG, p_actor: 'outro', user_id: 'outro', session_id: 'outra' }));
    const [name, args] = gw.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('list_customers');
    expect(args).toMatchObject({ p_actor: USER, p_session: SESSION, p_organization: ORG });
    expect(JSON.stringify(args)).not.toContain('outro');
  });
});

describe('query-registry: clientes e unidades', () => {
  it('repassa busca, filtros, cursor e limite com os nomes dos argumentos', async () => {
    const gw = gateway();
    const response = await handler(gw)(post({
      operation: 'list_customers', organization_id: ORG, search: ' hospital ', status: 'all', segment: 'clinic', state: 'SP', has_geofence: true, sort: 'name_desc', cursor: 'abc', limit: 50,
    }));
    expect(response.status).toBe(200);
    expect(gw.rpc.mock.calls[0]?.[1]).toMatchObject({
      p_search: 'hospital', p_status: 'all', p_segment: 'clinic', p_state: 'SP', p_has_geofence: true, p_sort: 'name_desc', p_cursor: 'abc', p_limit: 50,
    });
  });

  it.each([
    [{ limit: 0 }], [{ limit: 101 }], [{ limit: 1.5 }], [{ status: 'todos' }], [{ segment: 'x' }], [{ state: 'sp' }], [{ sort: 'x' }], [{ has_geofence: 'sim' }],
  ])('parâmetros fora do contrato (%j) são recusados antes do banco', async (extra) => {
    const gw = gateway();
    expect((await handler(gw)(post({ operation: 'list_customers', organization_id: ORG, ...extra }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('get_customer, list_sites e get_site exigem identificadores UUID', async () => {
    const gw = gateway({ code: 'FOUND' });
    expect((await handler(gw)(post({ operation: 'get_customer', organization_id: ORG, customer_id: 'x' }))).status).toBe(400);
    expect((await handler(gw)(post({ operation: 'get_customer', organization_id: ORG, customer_id: CUSTOMER }))).status).toBe(200);
    expect((await handler(gw)(post({ operation: 'list_sites', organization_id: ORG, customer_id: CUSTOMER }))).status).toBe(200);
    expect((await handler(gw)(post({ operation: 'get_site', organization_id: ORG }))).status).toBe(400);
  });

  it('mapeia NOT_FOUND e ACCESS_DENIED; a negação é auditada', async () => {
    expect((await handler(gateway({ code: 'NOT_FOUND' }))(post({ operation: 'get_customer', organization_id: ORG, customer_id: CUSTOMER }))).status).toBe(404);
    const denied = gateway({ code: 'ACCESS_DENIED' });
    expect((await handler(denied)(post({ operation: 'get_customer', organization_id: ORG, customer_id: CUSTOMER }))).status).toBe(403);
    expect(denied.audit).toHaveBeenCalledWith({ actorId: USER, action: 'registry.get_customer', result: 'denied', reason: 'permission_denied' });
  });

  it('falha do banco vira 500 sem detalhe', async () => {
    const gw = gateway({}, { rpc: vi.fn(async () => { throw new Error('boom: detalhe interno'); }) });
    const response = await handler(gw)(post({ operation: 'list_customers', organization_id: ORG }));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('boom');
  });

  it('nenhuma consulta ou RPC do catálogo sugere escrita ou exclusão', () => {
    for (const [operation, spec] of Object.entries(QUERY_OPERATIONS)) {
      expect(operation).toMatch(/^(list|get|history|preview|point|geofences|reveal)/);
      expect(spec.rpc).not.toMatch(/delete|remove|purge|drop|truncate|create|update/);
    }
  });
});

describe('query-registry: geocercas (US3)', () => {
  const GEOFENCE = '84000000-0000-4000-8000-000000000001';

  it('lista com filtros de unidade, cliente e forma', async () => {
    const gw = gateway();
    await handler(gw)(post({ operation: 'list_geofences', organization_id: ORG, site_id: CUSTOMER, customer_id: CUSTOMER, shape: 'polygon', status: 'all', search: 'portão' }));
    expect(gw.rpc.mock.calls[0]?.[1]).toMatchObject({ p_site: CUSTOMER, p_customer: CUSTOMER, p_shape: 'polygon', p_status: 'all', p_search: 'portão' });
  });

  it('consulta de ponto exige latitude e longitude nos intervalos', async () => {
    const gw = gateway({ code: 'FOUND', geofences: [] });
    expect((await handler(gw)(post({ operation: 'geofences_containing_point', organization_id: ORG, latitude: -23.5, longitude: -46.6 }))).status).toBe(200);
    expect((await handler(gw)(post({ operation: 'geofences_containing_point', organization_id: ORG, latitude: 91, longitude: 0 }))).status).toBe(400);
    expect((await handler(gw)(post({ operation: 'point_in_geofence', organization_id: ORG, geofence_id: GEOFENCE, latitude: 0, longitude: 181 }))).status).toBe(400);
    expect((await handler(gw)(post({ operation: 'point_in_geofence', organization_id: ORG, geofence_id: GEOFENCE, latitude: 0, longitude: 0 }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenLastCalledWith('point_in_geofence', expect.objectContaining({ p_geofence: GEOFENCE, p_latitude: 0, p_longitude: 0 }));
  });

  it('geocerca inativa na consulta de ponto responde 409', async () => {
    expect((await handler(gateway({ code: 'INACTIVE_RECORD' }))(post({ operation: 'point_in_geofence', organization_id: ORG, geofence_id: GEOFENCE, latitude: 0, longitude: 0 }))).status).toBe(409);
  });
});
