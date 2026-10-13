// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryTripsHandler } from '../../supabase/functions/query-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 010, T021 (RF-006, RF-007): `get_trip_offline` devolve ao aparelho a viagem aberta com os identificadores ativos normalizados. A permissão e o
// conteúdo (nunca recebedor, coordenadas registradas nem anexos) são garantidos no banco (supabase/tests/010_offline_trip.test.sql).
const ORG = '20000000-0000-4000-8000-00000000000a';
const TRIP = '99000000-0000-4000-8000-000000000001';

const gateway = (result: Record<string, unknown>): OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000001002a2', aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const request = { operation: 'get_trip_offline', organization_id: ORG, trip_id: TRIP };

describe('get_trip_offline', () => {
  it('chama a função do banco com a viagem e devolve o corpo', async () => {
    const body = { code: 'OK', fetched_at: '2026-10-12T12:00:00Z', trip: { id: TRIP, status: 'loading' }, items: [], stops: [], deliveries: [] };
    const gw = gateway(body);
    const response = await createQueryTripsHandler(gw)(post(request));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(gw.rpc).toHaveBeenCalledWith('query_trip_offline', expect.objectContaining({ p_organization: ORG, p_trip: TRIP }));
  });

  it('exige a viagem (uuid)', async () => {
    const gw = gateway({ code: 'OK' });
    expect((await createQueryTripsHandler(gw)(post({ ...request, trip_id: 'abc' }))).status).toBe(400);
    expect((await createQueryTripsHandler(gw)(post({ operation: 'get_trip_offline', organization_id: ORG }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each([['TRIP_STATE_INVALID', 409], ['NOT_FOUND', 404], ['ACCESS_DENIED', 403], ['AUTH_REQUIRED', 401]])('%s vira %i', async (code, status) => {
    const gw = gateway({ code });
    expect((await createQueryTripsHandler(gw)(post(request))).status).toBe(status);
  });

  it('a negação de permissão é auditada, sem dado da viagem', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await createQueryTripsHandler(gw)(post(request));
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ result: 'denied', reason: 'permission_denied' }));
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain(TRIP);
  });

  it('o sucesso não gera auditoria (consulta somente leitura)', async () => {
    const gw = gateway({ code: 'OK', items: [] });
    await createQueryTripsHandler(gw)(post(request));
    expect(gw.audit).not.toHaveBeenCalled();
  });

  it('não repassa nenhum campo a mais ao banco (nada de queued_at nem recebedor)', async () => {
    const gw = gateway({ code: 'OK' });
    await createQueryTripsHandler(gw)(post({ ...request, queued_at: '2026-10-12T12:00:00Z', recipient_name: 'x' }));
    expect(Object.keys(gw.rpc.mock.calls[0]![1] as object).sort()).toEqual(['p_actor', 'p_organization', 'p_session', 'p_trip']);
  });
});
