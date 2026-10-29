// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createQueryTrackingHandler, QUERY_TRACKING_OPERATIONS } from '../../supabase/functions/query-tracking/handler';
import { createManageTrackingHandler, MANAGE_TRACKING_OPERATIONS } from '../../supabase/functions/manage-tracking/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 015 (T017a): borda do rastreamento. O cliente só chega às RPCs por `query-tracking` e `manage-tracking`; ator e sessão vêm do
// token; cada RPC do catálogo é executável somente por service_role. O banco é falso.
const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000001500a2';
const ORG = '20000000-0000-4000-8000-00000000000a';

const ROOT = join(__dirname, '..', '..');
const migrationsDir = join(ROOT, 'supabase', 'migrations');
const sql = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => readFileSync(join(migrationsDir, name), 'utf8')).join('\n');

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => ({ code: 'FOUND' })),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown, token = 'jwt', method = 'POST') => new Request('http://local/fn', {
  method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
  body: method === 'POST' ? JSON.stringify(body) : undefined,
});

const HANDLERS = [
  ['query-tracking', createQueryTrackingHandler, QUERY_TRACKING_OPERATIONS],
  ['manage-tracking', createManageTrackingHandler, MANAGE_TRACKING_OPERATIONS],
] as const;

describe.each(HANDLERS)('%s', (_name, create, operations) => {
  it('só POST, exige token e responde ao preflight', async () => {
    expect((await create(gateway())(post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await create(gateway())(new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await create(gateway())(post({ operation: 'x', organization_id: ORG }, ''))).status).toBe(401);
  });

  it('operação desconhecida: 400, nenhuma RPC e negação auditada com o prefixo tracking', async () => {
    const gw = gateway();
    expect((await create(gw)(post({ operation: 'delete_positions', organization_id: ORG }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'tracking.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('cada RPC do catálogo é executável só por service_role e recebe ator e sessão', () => {
    for (const spec of Object.values(operations)) {
      expect(sql, spec.rpc).toMatch(new RegExp(String.raw`create (or replace )?function public\.${spec.rpc}\(p_actor uuid, p_session uuid, p_organization uuid`));
      expect(sql, spec.rpc).toMatch(new RegExp(String.raw`grant execute on function [^;]*public\.${spec.rpc}\([^)]*\)[^;]* to service_role;`));
      expect(sql, spec.rpc).not.toMatch(new RegExp(String.raw`grant execute on function [^;]*public\.${spec.rpc}\([^)]*\)[^;]* to [^;]*authenticated`));
    }
  });
});

describe('consultas de acompanhamento (US1)', () => {
  const TRIP = 'b1560000-0000-4000-8000-0000000000a1';

  it('list_active_trip_tracking repassa filtros, cursor e limite com ator e sessão do token', async () => {
    const gw = gateway();
    const response = await createQueryTrackingHandler(gw)(post({
      operation: 'list_active_trip_tracking', organization_id: ORG, vehicle_id: TRIP, cursor_at: '2026-10-22T14:00:00Z', cursor_id: TRIP, limit: 20,
      p_actor: 'outro',
    }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('list_active_trip_tracking', expect.objectContaining({
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_vehicle: TRIP, p_cursor_at: '2026-10-22T14:00:00Z', p_cursor_id: TRIP, p_limit: 20,
    }));
  });

  it('list_active_trip_tracking recusa limite acima de 100 e cursor sem fuso', async () => {
    const gw = gateway();
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'list_active_trip_tracking', organization_id: ORG, limit: 101 }))).status).toBe(400);
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'list_active_trip_tracking', organization_id: ORG, cursor_at: '2026-10-22T14:00:00', cursor_id: TRIP }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('get_trip_tracking exige o id da viagem', async () => {
    const gw = gateway();
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'get_trip_tracking', organization_id: ORG }))).status).toBe(400);
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'get_trip_tracking', organization_id: ORG, trip_id: TRIP }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('get_trip_tracking', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_trip: TRIP });
  });
});

describe('coleta do motorista e regra (US2)', () => {
  const TRIP = 'b1560000-0000-4000-8000-0000000000a1';
  const SESSION_ID = 'b1590000-0000-4000-8000-0000000000a1';
  const INSTALLATION = 'b15a0000-0000-4000-8000-0000000000a1';
  const REQUEST = 'c15c0000-0000-4000-8000-000000000001';
  const position = (overrides: Record<string, unknown> = {}) => ({
    client_position_id: 'c15d0000-0000-4000-8000-000000000001', sequence_no: 1, observed_at: '2026-10-22T14:02:00Z',
    latitude: -7.229, longitude: -39.313, accuracy_m: 18.4, ...overrides,
  });

  it('start_tracking_session repassa viagem, instalação, plataforma e capacidade', async () => {
    const gw = gateway();
    gw.rpc.mockResolvedValueOnce({ code: 'STARTED', session: {} });
    const response = await createManageTrackingHandler(gw)(post({ operation: 'start_tracking_session', organization_id: ORG, request_id: REQUEST,
      trip_id: TRIP, device_installation_id: INSTALLATION, platform: 'android_native', capability: 'full', notifications_denied: false }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('start_tracking_session', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST, p_trip: TRIP, p_installation: INSTALLATION,
      p_platform: 'android_native', p_capability: 'full', p_notifications_denied: false,
    });
    expect((await createManageTrackingHandler(gw)(post({ operation: 'start_tracking_session', organization_id: ORG, request_id: REQUEST,
      trip_id: TRIP, device_installation_id: INSTALLATION, platform: 'ios_native', capability: 'full' }))).status).toBe(400);
  });

  it('ingest_driver_positions aceita de 1 a 100 posições e repassa o lote', async () => {
    const gw = gateway();
    gw.rpc.mockResolvedValue({ code: 'INGESTED', results: [] });
    const handler = createManageTrackingHandler(gw);
    const base = { operation: 'ingest_driver_positions', organization_id: ORG, request_id: REQUEST, tracking_session_id: SESSION_ID, device_installation_id: INSTALLATION };
    expect((await handler(post({ ...base, positions: [position()] }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('ingest_driver_positions', expect.objectContaining({
      p_tracking_session: SESSION_ID, p_installation: INSTALLATION, p_positions: [position()],
    }));
    expect((await handler(post({ ...base, positions: [] }))).status).toBe(400);
    expect((await handler(post({ ...base, positions: Array.from({ length: 101 }, () => position()) }))).status).toBe(400);
    expect((await handler(post({ ...base, positions: [position({ latitude: 'norte' })] }))).status).toBe(400);
  });

  it('códigos de negócio da coleta viram HTTP de conflito, sem erro interno', async () => {
    for (const code of ['SESSION_ENDED', 'CONTEXT_MISMATCH', 'BATCH_TOO_LARGE', 'TRIP_STATE_INVALID', 'JUSTIFICATION_REQUIRED']) {
      const gw = gateway();
      gw.rpc.mockResolvedValueOnce({ code });
      const response = await createManageTrackingHandler(gw)(post({ operation: 'end_tracking_session', organization_id: ORG, request_id: REQUEST,
        tracking_session_id: SESSION_ID, reason: 'completed' }));
      expect([400, 409], code).toContain(response.status);
    }
  });

  it('report_tracking_capability e end_tracking_session validam o vocabulário', async () => {
    const gw = gateway();
    gw.rpc.mockResolvedValue({ code: 'UPDATED' });
    const handler = createManageTrackingHandler(gw);
    expect((await handler(post({ operation: 'report_tracking_capability', organization_id: ORG, request_id: REQUEST, tracking_session_id: SESSION_ID,
      capability: 'foreground_only', notifications_denied: true }))).status).toBe(200);
    expect((await handler(post({ operation: 'report_tracking_capability', organization_id: ORG, request_id: REQUEST, tracking_session_id: SESSION_ID,
      capability: 'tudo', notifications_denied: true }))).status).toBe(400);
    expect((await handler(post({ operation: 'end_tracking_session', organization_id: ORG, request_id: REQUEST, tracking_session_id: SESSION_ID,
      reason: 'abandoned' }))).status).toBe(400);
  });

  it('set_proximity_rule exige justificativa e números; get_proximity_rule é consulta', async () => {
    const gw = gateway();
    gw.rpc.mockResolvedValue({ code: 'UPDATED', rule: {} });
    const handler = createManageTrackingHandler(gw);
    expect((await handler(post({ operation: 'set_proximity_rule', organization_id: ORG, request_id: REQUEST, distance_m: 200, max_age_s: 180,
      max_accuracy_m: 40, justification: 'Rota rural com sinal fraco.' }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('set_proximity_rule', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST, p_distance: 200, p_max_age: 180, p_max_accuracy: 40,
      p_justification: 'Rota rural com sinal fraco.',
    });
    expect((await handler(post({ operation: 'set_proximity_rule', organization_id: ORG, request_id: REQUEST, distance_m: 200, max_age_s: 180,
      max_accuracy_m: 40 }))).status).toBe(400);
    const query = gateway();
    expect((await createQueryTrackingHandler(query)(post({ operation: 'get_proximity_rule', organization_id: ORG }))).status).toBe(200);
    expect(query.rpc).toHaveBeenCalledWith('get_proximity_rule', { p_actor: USER, p_session: SESSION, p_organization: ORG });
  });

  it('get_driver_tracking_status exige a viagem e não escreve', async () => {
    const gw = gateway();
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'get_driver_tracking_status', organization_id: ORG }))).status).toBe(400);
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'get_driver_tracking_status', organization_id: ORG, trip_id: TRIP }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('get_driver_tracking_status', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_trip: TRIP });
  });

  it('list_my_driver_trips só leva a empresa à RPC', async () => {
    const gw = gateway();
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'list_my_driver_trips', organization_id: ORG, trip_id: TRIP }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('list_my_driver_trips', { p_actor: USER, p_session: SESSION, p_organization: ORG });
  });
});

describe('histórico (US3)', () => {
  const ID = 'e1560000-0000-4000-8000-0000000000a1';

  it('query_tracking_history repassa assunto, período, cursor e limite', async () => {
    const gw = gateway();
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'query_tracking_history', organization_id: ORG, subject: 'cylinder', subject_id: ID,
      from: '2026-10-22T08:00:00-03:00', to: '2026-10-22T18:00:00-03:00', cursor_at: '2026-10-22T12:00:00Z', cursor_id: ID, limit: 200 }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('query_tracking_history', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_subject: 'cylinder', p_subject_id: ID, p_from: '2026-10-22T08:00:00-03:00',
      p_to: '2026-10-22T18:00:00-03:00', p_cursor_at: '2026-10-22T12:00:00Z', p_cursor_id: ID, p_limit: 200,
    });
  });

  it('recusa assunto desconhecido, período sem fuso e limite acima de 200', async () => {
    const gw = gateway();
    const base = { operation: 'query_tracking_history', organization_id: ORG, subject: 'trip', subject_id: ID, from: '2026-10-22T08:00:00Z', to: '2026-10-22T18:00:00Z' };
    for (const body of [{ ...base, subject: 'vehicle' }, { ...base, from: '2026-10-22T08:00:00' }, { ...base, limit: 201 }]) {
      expect((await createQueryTrackingHandler(gw)(post(body))).status).toBe(400);
    }
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});

describe('tratamento de ocorrência (US4)', () => {
  const OCC = 'f1560000-0000-4000-8000-0000000000a1';
  const REQUEST = 'f15c0000-0000-4000-8000-000000000001';

  it('get_proximity_occurrence exige o id', async () => {
    const gw = gateway();
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'get_proximity_occurrence', organization_id: ORG }))).status).toBe(400);
    expect((await createQueryTrackingHandler(gw)(post({ operation: 'get_proximity_occurrence', organization_id: ORG, occurrence_id: OCC }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('get_proximity_occurrence', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_occurrence: OCC });
  });

  it('reconhecer e encerrar levam versão e pedido; encerrar exige a nota', async () => {
    const gw = gateway();
    gw.rpc.mockResolvedValue({ code: 'ACKNOWLEDGED', version: 2 });
    const handler = createManageTrackingHandler(gw);
    expect((await handler(post({ operation: 'acknowledge_proximity_occurrence', organization_id: ORG, request_id: REQUEST, occurrence_id: OCC, version: 1 }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('acknowledge_proximity_occurrence', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST,
      p_occurrence: OCC, p_version: 1 });
    expect((await handler(post({ operation: 'close_proximity_occurrence', organization_id: ORG, request_id: REQUEST, occurrence_id: OCC, version: 2 }))).status).toBe(400);
    gw.rpc.mockResolvedValue({ code: 'CLOSED', version: 3 });
    expect((await handler(post({ operation: 'close_proximity_occurrence', organization_id: ORG, request_id: REQUEST, occurrence_id: OCC, version: 2,
      note: 'Carga conferida.' }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenLastCalledWith('close_proximity_occurrence', expect.objectContaining({ p_version: 2, p_note: 'Carga conferida.' }));
  });

  it('conflito de versão e transição inválida viram 409', async () => {
    for (const code of ['VERSION_CONFLICT', 'INVALID_TRANSITION']) {
      const gw = gateway();
      gw.rpc.mockResolvedValueOnce({ code });
      expect((await createManageTrackingHandler(gw)(post({ operation: 'acknowledge_proximity_occurrence', organization_id: ORG, request_id: REQUEST,
        occurrence_id: OCC, version: 1 }))).status, code).toBe(409);
    }
  });
});

describe('separação entre consulta e comando', () => {
  it('query-tracking não escreve', () => {
    for (const [name, spec] of Object.entries(QUERY_TRACKING_OPERATIONS)) {
      expect(name).not.toMatch(/delete|remove|create|update|set|ingest|start|end|acknowledge|close/);
      expect(spec.fields).not.toHaveProperty('request_id');
    }
  });

  it('todo comando de manage-tracking é idempotente por request_id', () => {
    for (const [name, spec] of Object.entries(MANAGE_TRACKING_OPERATIONS)) expect(spec.fields, name).toHaveProperty('request_id');
  });
});
