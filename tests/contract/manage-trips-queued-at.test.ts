// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageTripsHandler, MANAGE_OPERATIONS } from '../../supabase/functions/manage-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 010, T018 (RF-009, RF-011, RF-012): as quatro operações de campo aceitam `queued_at` (a hora do aparelho em que o pedido entrou na fila).
// Com ele, a borda registra o resultado na trilha de sincronização; sem ele, nada muda. A chegada e a entrega repassam `p_queued_at` ao banco;
// a conferência e o desfazer só gravam a trilha. Nenhum dado sensível vai à trilha (supabase/tests/010_sync_events.test.sql).
const ORG = '20000000-0000-4000-8000-00000000000a';
const REQUEST = 'a0000000-0000-4000-8000-000000000001';
const TRIP = '99000000-0000-4000-8000-000000000001';
const STOP = '9a000000-0000-4000-8000-000000000001';
const ITEM = '9b000000-0000-4000-8000-000000000001';
const QUEUED = '2026-10-12T12:00:00Z';

type Gw = OperationsGateway & { rpc: ReturnType<typeof vi.fn> };
// A primeira chamada é a operação; as seguintes (`record_trip_sync_event`) respondem RECORDED.
const gateway = (result: Record<string, unknown>, record: Record<string, unknown> | Error = { code: 'RECORDED' }): Gw => ({
  authenticate: vi.fn(async () => ({ userId: '10000000-0000-4000-8000-000000000002', sessionId: '60000000-0000-4000-8000-0000001000a2', aal: 'aal1' as const })),
  rpc: vi.fn(async (name: string) => {
    if (name === 'record_trip_sync_event') { if (record instanceof Error) throw record; return record; }
    return result;
  }),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const calls = (gw: Gw, name: string) => gw.rpc.mock.calls.filter((call) => call[0] === name).map((call) => call[1] as Record<string, unknown>);

const check = { operation: 'check_item', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, item_id: ITEM };
const uncheck = { operation: 'uncheck_item', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, item_id: ITEM };
const arrive = { operation: 'arrive_stop', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP };
const deliver = {
  operation: 'register_delivery', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP, delivered_at: '2026-10-12T11:59:00Z',
  recipient_name: 'Recebedor Fictício', latitude: -23.55, longitude: -46.633, results: [{ item_id: ITEM, delivered: true }],
};

describe('queued_at repassado ao banco (chegada e entrega)', () => {
  it('arrive_stop repassa p_queued_at e registra "applied"', async () => {
    const gw = gateway({ code: 'ARRIVED' });
    expect((await createManageTripsHandler(gw)(post({ ...arrive, queued_at: QUEUED }))).status).toBe(200);
    expect(calls(gw, 'arrive_stop')[0]).toMatchObject({ p_queued_at: QUEUED });
    expect(calls(gw, 'record_trip_sync_event')).toEqual([expect.objectContaining({
      p_organization: ORG, p_request: REQUEST, p_operation: 'arrive_stop', p_trip: TRIP, p_outcome: 'applied', p_reason: null, p_queued_at: QUEUED,
    })]);
  });

  it('register_delivery repassa p_queued_at e registra "register_delivery"', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    expect((await createManageTripsHandler(gw)(post({ ...deliver, queued_at: QUEUED }))).status).toBe(200);
    expect(calls(gw, 'register_delivery')[0]).toMatchObject({ p_queued_at: QUEUED });
    expect(calls(gw, 'record_trip_sync_event')[0]).toMatchObject({ p_operation: 'register_delivery', p_outcome: 'applied' });
  });

  it('sem queued_at nada muda: nenhum p_queued_at e nenhuma trilha', async () => {
    const gw = gateway({ code: 'ARRIVED' });
    await createManageTripsHandler(gw)(post(arrive));
    expect(calls(gw, 'arrive_stop')[0]).toMatchObject({ p_queued_at: null });
    expect(calls(gw, 'record_trip_sync_event')).toHaveLength(0);
  });
});

describe('queued_at só na trilha (conferência e desfazer)', () => {
  it('check_item não repassa p_queued_at (a função SQL não o recebe), mas registra a trilha', async () => {
    const gw = gateway({ code: 'CHECKED', checked: 1, total: 2 });
    expect((await createManageTripsHandler(gw)(post({ ...check, queued_at: QUEUED }))).status).toBe(200);
    expect(calls(gw, 'check_item')[0]).not.toHaveProperty('p_queued_at');
    expect(calls(gw, 'record_trip_sync_event')[0]).toMatchObject({ p_operation: 'check_item', p_outcome: 'applied', p_queued_at: QUEUED });
  });

  it('uncheck_item idem', async () => {
    const gw = gateway({ code: 'UNCHECKED' });
    await createManageTripsHandler(gw)(post({ ...uncheck, queued_at: QUEUED }));
    expect(calls(gw, 'uncheck_item')[0]).not.toHaveProperty('p_queued_at');
    expect(calls(gw, 'record_trip_sync_event')[0]).toMatchObject({ p_operation: 'uncheck_item', p_outcome: 'applied' });
  });

  it('operação fora da fila ignora queued_at: sem trilha e sem p_queued_at', async () => {
    const gw = gateway({ code: 'STARTED' });
    await createManageTripsHandler(gw)(post({ operation: 'start_trip', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, expected_version: 2, queued_at: QUEUED }));
    expect(calls(gw, 'start_trip')[0]).not.toHaveProperty('p_queued_at');
    expect(calls(gw, 'record_trip_sync_event')).toHaveLength(0);
  });
});

describe('resultado registrado na trilha', () => {
  it('resposta repetida (replayed) vira "replayed"', async () => {
    const gw = gateway({ code: 'CHECKED', replayed: true });
    await createManageTripsHandler(gw)(post({ ...check, queued_at: QUEUED }));
    expect(calls(gw, 'record_trip_sync_event')[0]).toMatchObject({ p_outcome: 'replayed' });
  });

  it.each([
    ['INVALID_TRANSITION', 409], ['TRIP_CLOSED', 409], ['STOP_CLOSED', 409], ['VERSION_CONFLICT', 409], ['STALE_OFFLINE_OPERATION', 409], ['NOT_FOUND', 404], ['VALIDATION_FAILED', 400],
  ])('%s vira conflito, com o código do motivo, e a borda responde %i', async (code, status) => {
    const gw = gateway({ code });
    const response = await createManageTripsHandler(gw)(post({ ...check, queued_at: QUEUED }));
    expect(response.status).toBe(status);
    expect(calls(gw, 'record_trip_sync_event')[0]).toMatchObject({ p_outcome: 'conflict', p_reason: code });
  });

  it.each(['AUTH_REQUIRED', 'ACCESS_DENIED'])('%s não entra na trilha (interrompe o envio, não é conflito)', async (code) => {
    const gw = gateway({ code });
    await createManageTripsHandler(gw)(post({ ...check, queued_at: QUEUED }));
    expect(calls(gw, 'record_trip_sync_event')).toHaveLength(0);
  });

  it('a trilha nunca recebe posição, recebedor, resultados nem valores lidos', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    await createManageTripsHandler(gw)(post({ ...deliver, queued_at: QUEUED, accuracy_m: 12, position_source: 'gps', position_read_at: '2026-10-12T11:58:00Z' }));
    const sent = calls(gw, 'record_trip_sync_event')[0]!;
    expect(Object.keys(sent).sort()).toEqual(['p_actor', 'p_operation', 'p_organization', 'p_outcome', 'p_queued_at', 'p_reason', 'p_request', 'p_session', 'p_trip']);
    expect(JSON.stringify(sent)).not.toMatch(/Recebedor|-23\.55|-46\.633/);
  });

  it('se a trilha falhar depois do sucesso, a borda responde 500 para a fila reenviar (o reenvio é idempotente)', async () => {
    const gw = gateway({ code: 'CHECKED' }, new Error('falha'));
    expect((await createManageTripsHandler(gw)(post({ ...check, queued_at: QUEUED }))).status).toBe(500);
  });
});

describe('validação de queued_at', () => {
  it.each([
    ['texto livre', 'ontem'], ['sem fuso', '2026-10-12T12:00:00'], ['número', 1760270400],
  ])('recusa %s', async (_label, value) => {
    const gw = gateway({ code: 'CHECKED' });
    const response = await createManageTripsHandler(gw)(post({ ...check, queued_at: value }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: [expect.objectContaining({ field: 'queued_at' })] });
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('recusa horário no futuro', async () => {
    const gw = gateway({ code: 'CHECKED' });
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    expect((await createManageTripsHandler(gw)(post({ ...check, queued_at: future }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('queued_at nulo vale como ausente', async () => {
    const gw = gateway({ code: 'CHECKED' });
    expect((await createManageTripsHandler(gw)(post({ ...check, queued_at: null }))).status).toBe(200);
    expect(calls(gw, 'record_trip_sync_event')).toHaveLength(0);
  });
});

describe('catálogo das operações de campo (Spec 010, RF-001 e RF-003)', () => {
  it('só as quatro operações de campo aceitam queued_at; as demais continuam exigindo conexão', () => {
    const withQueue = Object.entries(MANAGE_OPERATIONS).filter(([, spec]) => spec.queuedAt).map(([name]) => name).sort();
    expect(withQueue).toEqual(['arrive_stop', 'check_item', 'register_delivery', 'uncheck_item']);
    for (const name of ['create_trip', 'update_trip', 'start_loading', 'revert_loading', 'start_trip', 'cancel_trip', 'complete_trip', 'unlock_item', 'return_item']) {
      if (name in MANAGE_OPERATIONS) expect(MANAGE_OPERATIONS[name]!.queuedAt, name).toBeUndefined();
    }
  });

  it('só a chegada e a entrega repassam p_queued_at ao banco; a operação da trilha leva o nome certo', () => {
    expect(Object.entries(MANAGE_OPERATIONS).filter(([, spec]) => spec.queuedAt?.forward).map(([name]) => name).sort()).toEqual(['arrive_stop', 'register_delivery']);
    for (const [name, spec] of Object.entries(MANAGE_OPERATIONS)) if (spec.queuedAt) expect(spec.queuedAt.operation, name).toBe(name);
  });
});
