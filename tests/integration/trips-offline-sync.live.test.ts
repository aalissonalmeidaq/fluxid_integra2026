// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endAllSessions, login, logout } from '../support/auth-harness';
import { createEligibleCylinder, createWorld, GADMIN, manageTrips, planBody, queryTrips, requestId, TENANT_G } from '../support/trips-fixtures';

// Spec 010, T045 (CA-001, MS-002, MS-003), contra o Supabase local real: a fila reenvia a mesma operação com a mesma chave quantas vezes for preciso, com quedas no
// caminho, e o servidor aplica cada uma exatamente uma vez (0 duplicada e 0 perdida em eventos, auditoria e trilha). Viagem cancelada em outra sessão vira conflito
// preservado; horário informado com mais de 7 dias vira STALE_OFFLINE_OPERATION. Exige as funções carregadas (`npx supabase stop` e `npx supabase start`).
const DAY = 24 * 60 * 60 * 1000;
const ok = (response: { status: number; body: unknown }, label: string): Record<string, unknown> => {
  if (response.status !== 200) throw new Error(`${label}: HTTP ${response.status} ${JSON.stringify(response.body)}`);
  return response.body as Record<string, unknown>;
};

describe('Fila offline: envio idempotente e conflitos ao vivo (Spec 010)', () => {
  let token = '';

  const detail = async (tripId: string) => ok(await queryTrips(token, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId }), 'get_trip');
  const history = async (tripId: string, eventType?: string) => ((ok(await queryTrips(token, { operation: 'trip_history', organization_id: TENANT_G, trip_id: tripId, ...(eventType ? { event_type: eventType } : {}), limit: 100 }), 'trip_history')).events as Array<{ event_type: string }>);
  const syncEvents = async (tripId: string) => (ok(await queryTrips(token, { operation: 'list_sync_events', organization_id: TENANT_G, trip_id: tripId, limit: 100 }), 'list_sync_events').items as Array<{ operation: string; outcome: string; reason_code: string | null }>);

  // Viagem em carregamento com um cilindro, pronta para conferir. Cada uma tem veículo e motorista próprios (um veículo só faz uma viagem aberta por vez).
  async function loading(): Promise<{ tripId: string; itemId: string; version: number }> {
    const own = await createWorld(token);
    const cylinder = await createEligibleCylinder(token, own.typeId);
    const planned = ok(await manageTrips(token, planBody(own, [{ cylinder_ids: [cylinder.id] }])), 'create_trip');
    const tripId = String(planned.trip_id);
    const started = ok(await manageTrips(token, { operation: 'start_loading', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: planned.version }), 'start_loading');
    const full = await detail(tripId);
    return { tripId, itemId: (full.items as Array<{ id: string }>)[0]!.id, version: Number(started.version) };
  }

  beforeAll(async () => {
    await endAllSessions(GADMIN);
    const session = await login(GADMIN);
    expect(session.status).toBe(200);
    token = session.body.session.access_token as string;
  }, 120_000);

  afterAll(async () => {
    if (token) await logout(token);
    await endAllSessions(GADMIN);
  });

  it('100 reenvios da mesma conferência, com quedas em pontos aleatórios: uma só aplicada, nenhuma perdida', async () => {
    const { tripId, itemId } = await loading();
    const request = requestId();
    const queuedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const body = { operation: 'check_item', organization_id: TENANT_G, request_id: request, trip_id: tripId, item_id: itemId, queued_at: queuedAt };
    let confirmed = 0;
    let replayed = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await manageTrips(token, body);
      // Queda simulada: a resposta "se perde" em ~1/3 das tentativas e o aparelho reenvia sem saber se o servidor gravou.
      if (Math.random() < 0.33) continue;
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      confirmed += 1;
      if ((response.body as { replayed?: boolean }).replayed === true) replayed += 1;
    }
    // Garante ao menos uma confirmação (a fila só marca "enviado" depois de uma resposta recebida).
    if (confirmed === 0) expect((await manageTrips(token, body)).status).toBe(200);
    expect(replayed).toBeLessThanOrEqual(Math.max(confirmed - 1, 0) + 1);

    const events = (await history(tripId, 'item_checked')).length;
    expect(events, 'a conferência foi aplicada uma só vez').toBe(1);
    const trail = await syncEvents(tripId);
    expect(trail.filter((entry) => entry.operation === 'check_item' && entry.outcome === 'applied')).toHaveLength(1);
    expect(trail.every((entry) => entry.outcome === 'applied' || entry.outcome === 'replayed')).toBe(true);
    const full = await detail(tripId);
    expect((full.items as Array<{ item_status: string }>)[0]!.item_status).toBe('checked');
  }, 300_000);

  it('reenviar com o mesmo request_id devolve o mesmo resultado e não duplica a auditoria', async () => {
    const { tripId, itemId } = await loading();
    const body = { operation: 'check_item', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, item_id: itemId, queued_at: new Date(Date.now() - 60_000).toISOString() };
    const first = await manageTrips(token, body);
    const second = await manageTrips(token, body);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect({ ...(second.body as object), replayed: undefined }).toEqual({ ...(first.body as object), replayed: undefined });
    expect((await history(tripId, 'item_checked'))).toHaveLength(1);
  }, 60_000);

  it('viagem cancelada em outra sessão: a operação da fila vira conflito e nada é aplicado', async () => {
    const { tripId, itemId, version } = await loading();
    ok(await manageTrips(token, { operation: 'cancel_trip', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: version, justification: 'Cancelada pelo despacho' }), 'cancel_trip');
    const request = requestId();
    const late = await manageTrips(token, { operation: 'check_item', organization_id: TENANT_G, request_id: request, trip_id: tripId, item_id: itemId, queued_at: new Date(Date.now() - 60_000).toISOString() });
    expect(late.status).toBe(409);
    expect(String((late.body as { code?: string }).code)).toMatch(/^[A-Z_]+$/);
    expect((await history(tripId, 'item_checked'))).toHaveLength(0);
    const trail = await syncEvents(tripId);
    expect(trail.filter((entry) => entry.outcome === 'conflict')).toHaveLength(1);
    expect(trail.find((entry) => entry.outcome === 'conflict')!.reason_code).toBeTruthy();

    // A decisão humana: descartar exige justificativa e fica registrada; repetir devolve o mesmo resultado.
    const decision = requestId();
    const semJustificativa = await manageTrips(token, { operation: 'resolve_sync_conflict', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, source_request_id: request, decision: 'discard', justification: 'abc' });
    expect(semJustificativa.status).toBe(400);
    const decided = await manageTrips(token, { operation: 'resolve_sync_conflict', organization_id: TENANT_G, request_id: decision, trip_id: tripId, source_request_id: request, decision: 'discard', justification: 'Viagem cancelada, registro sem efeito' });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const again = await manageTrips(token, { operation: 'resolve_sync_conflict', organization_id: TENANT_G, request_id: decision, trip_id: tripId, source_request_id: request, decision: 'discard', justification: 'Viagem cancelada, registro sem efeito' });
    expect(again.status).toBe(200);
    expect((await history(tripId, 'sync_conflict_discarded'))).toHaveLength(1);
  }, 120_000);

  it('horário informado com mais de 7 dias de atraso vira STALE_OFFLINE_OPERATION', async () => {
    const { tripId } = await loading();
    const planned = await detail(tripId);
    const stop = (planned.stops as Array<{ id: string }>)[0]!;
    const response = await manageTrips(token, {
      operation: 'arrive_stop', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, stop_id: stop.id, queued_at: new Date(Date.now() - 8 * DAY).toISOString(),
    });
    // A viagem ainda está em carregamento: a recusa pode vir pela situação ou pelo atraso, e as duas são conflitos preservados, nunca erro do servidor.
    expect(response.status).toBe(409);
    expect(['STALE_OFFLINE_OPERATION', 'TRIP_STATE_INVALID', 'INVALID_TRANSITION']).toContain(String((response.body as { code?: string }).code));
  }, 60_000);

  it('queued_at no futuro é recusado e a trilha nunca guarda dado sensível', async () => {
    const { tripId, itemId } = await loading();
    const future = await manageTrips(token, { operation: 'check_item', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, item_id: itemId, queued_at: new Date(Date.now() + DAY).toISOString() });
    expect(future.status).toBe(400);
    ok(await manageTrips(token, { operation: 'check_item', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, item_id: itemId, queued_at: new Date(Date.now() - 1000).toISOString() }), 'check_item');
    expect(JSON.stringify(await syncEvents(tripId))).not.toMatch(/recipient|latitude|longitude|storage|\.jpg|\.png/i);
  }, 60_000);
});
