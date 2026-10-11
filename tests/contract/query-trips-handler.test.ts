// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryTripsHandler, QUERY_OPERATIONS } from '../../supabase/functions/query-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 008, US1: query-trips (RF-026, RF-029, RF-030). O banco é sempre falso; consulta não audita sucesso.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000800a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const TRIP = '99000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'LISTED', items: [] }): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const handler = (gw: Gateway) => createQueryTripsHandler(gw);

describe('query-trips: borda comum', () => {
  it('só aceita POST, exige token e responde ao preflight', async () => {
    expect((await handler(gateway())(post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await handler(gateway())(new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(gateway())(post({ operation: 'list_trips', organization_id: ORG }, ''))).status).toBe(401);
  });

  it('operação desconhecida (inclusive exclusão): 400 e auditoria da negação', async () => {
    const gw = gateway();
    for (const operation of ['delete_trip', 'update_trip', 'drop', 'trips_of_nothing']) {
      expect((await handler(gw)(post({ operation, organization_id: ORG }))).status).toBe(400);
    }
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('nenhuma operação do catálogo escreve ou exclui', () => {
    for (const [name, spec] of Object.entries(QUERY_OPERATIONS)) {
      expect(name).not.toMatch(/^(create|update|delete|remove|start|check|register|cancel|complete|return)/);
      expect(spec.rpc).not.toMatch(/^(create|update|delete|remove|start|check|register|cancel|complete|return)/);
    }
  });

  it('consulta com sucesso não gera auditoria', async () => {
    const gw = gateway();
    expect((await handler(gw)(post({ operation: 'list_trips', organization_id: ORG }))).status).toBe(200);
    expect(gw.audit).not.toHaveBeenCalled();
  });
});

describe('query-trips: operações do planejamento', () => {
  it('list_trips leva os filtros ao banco com os nomes dos argumentos', async () => {
    const gw = gateway();
    await handler(gw)(post({
      operation: 'list_trips', organization_id: ORG, search: 'AAA', status: 'all', from: '2026-10-01', to: '2026-10-31',
      vehicle_id: '95000000-0000-4000-8000-000000000001', custody: 'in_transit', sort: 'date_desc', cursor: 'abc', limit: 50,
    }));
    expect(gw.rpc.mock.calls[0]).toEqual(['list_trips', expect.objectContaining({
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_search: 'AAA', p_status: 'all', p_from: '2026-10-01', p_to: '2026-10-31',
      p_vehicle: '95000000-0000-4000-8000-000000000001', p_driver: null, p_customer: null, p_custody: 'in_transit', p_sort: 'date_desc', p_cursor: 'abc', p_limit: 50,
    })]);
  });

  it('list_trips sem filtros chama o banco com tudo nulo', async () => {
    const gw = gateway();
    await handler(gw)(post({ operation: 'list_trips', organization_id: ORG }));
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_search: null, p_status: null, p_cursor: null, p_limit: null });
  });

  it.each([
    { status: 'bogus' }, { sort: 'name' }, { custody: 'lost' }, { limit: 0 }, { limit: 101 }, { from: '2026-13-01' }, { vehicle_id: 'x' }, { search: 's'.repeat(201) }, { cursor: 'c'.repeat(401) },
  ])('filtro inválido %j: 400 sem chamar o banco', async (extra) => {
    const gw = gateway();
    expect((await handler(gw)(post({ operation: 'list_trips', organization_id: ORG, ...extra }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('get_trip exige o id da viagem', async () => {
    const gw = gateway({ code: 'FOUND' });
    expect((await handler(gw)(post({ operation: 'get_trip', organization_id: ORG }))).status).toBe(400);
    expect((await handler(gw)(post({ operation: 'get_trip', organization_id: ORG, trip_id: TRIP }))).status).toBe(200);
    expect(gw.rpc.mock.calls[0]).toEqual(['get_trip', expect.objectContaining({ p_trip: TRIP })]);
  });

  it('trip_options e list_eligible_cylinders levam busca, tipo e paginação', async () => {
    const gw = gateway({ code: 'LISTED' });
    await handler(gw)(post({ operation: 'trip_options', organization_id: ORG, search: 'aaa' }));
    await handler(gw)(post({ operation: 'list_eligible_cylinders', organization_id: ORG, search: 'CIL', cylinder_type_id: '97000000-0000-4000-8000-00000000000a', cursor: 'x', limit: 20 }));
    expect(gw.rpc.mock.calls[0]).toEqual(['trip_options', expect.objectContaining({ p_search: 'aaa' })]);
    expect(gw.rpc.mock.calls[1]).toEqual(['list_eligible_cylinders', expect.objectContaining({ p_search: 'CIL', p_type: '97000000-0000-4000-8000-00000000000a', p_cursor: 'x', p_limit: 20 })]);
  });

  it.each([['NOT_FOUND', 404], ['ACCESS_DENIED', 403], ['AUTH_REQUIRED', 401], ['VALIDATION_FAILED', 400]])('o código %s do banco vira HTTP %i', async (code, status) => {
    expect((await handler(gateway({ code }))(post({ operation: 'get_trip', organization_id: ORG, trip_id: TRIP }))).status).toBe(status);
  });
});

describe('query-trips: consultas e histórico (US6)', () => {
  const CYLINDER = '98000000-0000-4000-8000-000000000001';
  const SITE = '92000000-0000-4000-8000-000000000001';

  it('trip_history leva tipo, período, ordem e paginação ao banco', async () => {
    const gw = gateway({ code: 'LISTED', events: [] });
    expect((await handler(gw)(post({ operation: 'trip_history', organization_id: ORG, trip_id: TRIP, event_type: 'item_checked', from: '2026-10-01', to: '2026-10-31', order: 'asc', cursor: 'c', limit: 10 }))).status).toBe(200);
    expect(gw.rpc.mock.calls[0]).toEqual(['trip_history', expect.objectContaining({
      p_trip: TRIP, p_event_type: 'item_checked', p_from: '2026-10-01', p_to: '2026-10-31', p_order: 'asc', p_cursor: 'c', p_limit: 10 })]);
    expect(gw.audit).not.toHaveBeenCalled();
  });

  it.each([{ trip_id: undefined }, { order: 'up' }, { limit: 101 }, { from: 'ontem' }])('trip_history com %j: 400 sem chamar o banco', async (extra) => {
    const gw = gateway();
    expect((await handler(gw)(post({ operation: 'trip_history', organization_id: ORG, trip_id: TRIP, ...extra }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('trips_of_cylinder e trips_of_site exigem o id e levam a paginação', async () => {
    const gw = gateway({ code: 'LISTED', items: [] });
    expect((await handler(gw)(post({ operation: 'trips_of_cylinder', organization_id: ORG }))).status).toBe(400);
    expect((await handler(gw)(post({ operation: 'trips_of_site', organization_id: ORG, site_id: 'x' }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    await handler(gw)(post({ operation: 'trips_of_cylinder', organization_id: ORG, cylinder_id: CYLINDER, cursor: 'c', limit: 5 }));
    await handler(gw)(post({ operation: 'trips_of_site', organization_id: ORG, site_id: SITE }));
    expect(gw.rpc.mock.calls[0]).toEqual(['trips_of_cylinder', expect.objectContaining({ p_cylinder: CYLINDER, p_cursor: 'c', p_limit: 5 })]);
    expect(gw.rpc.mock.calls[1]).toEqual(['trips_of_site', expect.objectContaining({ p_site: SITE, p_cursor: null, p_limit: null })]);
  });
});
