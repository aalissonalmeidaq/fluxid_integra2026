// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryTripsHandler } from '../../supabase/functions/query-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 010, T035 (RF-012): `list_sync_events` devolve a trilha de sincronização da viagem a quem pode ver o histórico (`trip.history`, conferido no banco).
// A trilha nunca traz dado sensível (supabase/tests/010_sync_events.test.sql).
const ORG = '20000000-0000-4000-8000-00000000000a';
const TRIP = '99000000-0000-4000-8000-000000000001';

const gateway = (result: Record<string, unknown>): OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000001000a2', aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const request = { operation: 'list_sync_events', organization_id: ORG, trip_id: TRIP };

describe('list_sync_events', () => {
  it('chama a função do banco com a viagem e devolve a trilha', async () => {
    const body = { code: 'OK', items: [{ id: 3, operation: 'arrive_stop', outcome: 'conflict', reason_code: 'TRIP_CLOSED' }], next: null };
    const gw = gateway(body);
    const response = await createQueryTripsHandler(gw)(post(request));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(gw.rpc).toHaveBeenCalledWith('query_sync_events', expect.objectContaining({ p_organization: ORG, p_trip: TRIP }));
  });

  it('aceita o limite e o cursor (id da última linha vista)', async () => {
    const gw = gateway({ code: 'OK', items: [], next: null });
    await createQueryTripsHandler(gw)(post({ ...request, limit: 20, before: 120 }));
    expect(gw.rpc).toHaveBeenCalledWith('query_sync_events', expect.objectContaining({ p_limit: 20, p_before: 120 }));
  });

  it.each([
    ['limite acima de 100', { limit: 101 }], ['limite zero', { limit: 0 }], ['cursor zero', { before: 0 }], ['cursor em texto', { before: 'abc' }], ['viagem inválida', { trip_id: 'x' }],
  ])('recusa %s', async (_label, over) => {
    const gw = gateway({ code: 'OK' });
    expect((await createQueryTripsHandler(gw)(post({ ...request, ...over }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each([['NOT_FOUND', 404], ['ACCESS_DENIED', 403], ['AUTH_REQUIRED', 401]])('%s vira %i', async (code, status) => {
    expect((await createQueryTripsHandler(gateway({ code }))(post(request))).status).toBe(status);
  });

  it('consulta somente leitura: o sucesso não gera auditoria', async () => {
    const gw = gateway({ code: 'OK', items: [], next: null });
    await createQueryTripsHandler(gw)(post(request));
    expect(gw.audit).not.toHaveBeenCalled();
  });
});
