// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageTripsHandler, MANAGE_OPERATIONS } from '../../supabase/functions/manage-trips/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 008, US1: manage-trips com o planejamento (RF-001 a RF-006, RF-030, RF-033). O banco é sempre falso; as regras de verdade
// são provadas nas suítes pgTAP (supabase/tests/008_*) e `.live`.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000800a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const REQUEST = 'a0000000-0000-4000-8000-000000000001';
const VEHICLE = '95000000-0000-4000-8000-000000000001';
const DRIVER = '96000000-0000-4000-8000-000000000001';
const SITE = '92000000-0000-4000-8000-000000000001';
const STOP = '9a000000-0000-4000-8000-000000000001';
const TRIP = '99000000-0000-4000-8000-000000000001';
const CYL = '98000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'CREATED' }, overrides: Partial<OperationsGateway> = {}): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
  ...overrides,
}) as never;

const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const handler = (gw: Gateway) => createManageTripsHandler(gw);

const create = {
  operation: 'create_trip', organization_id: ORG, request_id: REQUEST, planned_date: '2026-10-20', vehicle_id: VEHICLE, driver_id: DRIVER,
  notes: 'Levar rampa', stops: [{ site_id: SITE, cylinder_ids: [CYL] }],
};
const update = { ...create, operation: 'update_trip', trip_id: TRIP, expected_version: 1, stops: [{ id: STOP, site_id: SITE, cylinder_ids: [CYL] }] };

describe('manage-trips: borda comum', () => {
  it('só aceita POST e responde ao preflight', async () => {
    expect((await handler(gateway())(post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await handler(gateway())(new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
  });

  it('sem token ou com token inválido: 401 e nenhuma chamada ao banco', async () => {
    const gw = gateway();
    expect((await handler(gw)(post(create, ''))).status).toBe(401);
    const invalid = gateway({}, { authenticate: vi.fn(async () => null) });
    expect((await handler(invalid)(post(create))).status).toBe(401);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(invalid.rpc).not.toHaveBeenCalled();
  });

  it('corpo inválido ou organização que não é UUID: 400', async () => {
    const gw = gateway();
    expect((await handler(gw)(new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'não é json' }))).status).toBe(400);
    expect((await handler(gw)(post({ ...create, organization_id: 'abc' }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('ator e sessão vêm do token, nunca de campos extras do corpo', async () => {
    const gw = gateway();
    await handler(gw)(post({ ...create, actor: 'outro', p_actor: 'outro', user_id: 'outro', session_id: 'outra' }));
    const [name, args] = gw.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('create_trip');
    expect(args).toMatchObject({ p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST, p_vehicle: VEHICLE, p_driver: DRIVER, p_planned_date: '2026-10-20' });
    expect(JSON.stringify(args)).not.toContain('outro');
  });

  it('a organização do corpo vai ao banco, que confere o vínculo e a sessão', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    const response = await handler(gw)(post({ ...create, organization_id: '20000000-0000-4000-8000-00000000000b' }));
    expect(response.status).toBe(403);
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_organization: '20000000-0000-4000-8000-00000000000b' });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.create', result: 'denied', reason: 'permission_denied' });
  });
});

describe('manage-trips: operações desconhecidas e exclusão (RF-033)', () => {
  it.each(['delete_trip', 'remove_trip', 'purge_trip', 'truncate', 'drop_trip', 'delete_stop', 'delete_item', '__proto__', 'constructor'])(
    '%s não existe: 400 e a tentativa é auditada como negada',
    async (operation) => {
      const gw = gateway();
      const response = await handler(gw)(post({ operation, organization_id: ORG, request_id: REQUEST, trip_id: TRIP }));
      expect(response.status).toBe(400);
      expect(gw.rpc).not.toHaveBeenCalled();
      expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
    },
  );

  it('nenhuma operação do catálogo exclui dado', () => {
    for (const [name, spec] of Object.entries(MANAGE_OPERATIONS)) {
      expect(name).not.toMatch(/^(delete|purge|destroy|truncate|drop)/);
      expect(spec.rpc).not.toMatch(/^(delete|purge|destroy|truncate|drop)/);
    }
  });
});

describe('manage-trips: planejamento', () => {
  it('create_trip e update_trip exigem request_id e os campos do contrato', async () => {
    const gw = gateway();
    for (const body of [
      { ...create, request_id: undefined }, { ...create, request_id: 'abc' }, { ...create, planned_date: '2026-02-30' }, { ...create, planned_date: undefined },
      { ...create, vehicle_id: 'x' }, { ...create, driver_id: undefined }, { ...create, notes: 'n'.repeat(501) }, { ...create, stops: [] }, { ...create, stops: undefined },
      { ...create, stops: [{ site_id: SITE, cylinder_ids: [] }] }, { ...create, stops: [{ site_id: 'x', cylinder_ids: [CYL] }] }, { ...create, stops: [{ site_id: SITE, cylinder_ids: ['x'] }] },
      { ...create, stops: Array.from({ length: 31 }, () => ({ site_id: SITE, cylinder_ids: [CYL] })) },
      { ...create, stops: [{ site_id: SITE, cylinder_ids: Array.from({ length: 201 }, () => CYL) }] },
      { ...update, trip_id: undefined }, { ...update, expected_version: 0 }, { ...update, expected_version: 'x' },
      { ...update, stops: [{ id: 'x', site_id: SITE, cylinder_ids: [CYL] }] },
    ]) {
      const response = await handler(gw)(post(body));
      expect(response.status, JSON.stringify(body).slice(0, 120)).toBe(400);
    }
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('aceita 30 paradas e 200 cilindros por parada (os limites)', async () => {
    const gw = gateway();
    expect((await handler(gw)(post({ ...create, stops: Array.from({ length: 30 }, () => ({ site_id: SITE, cylinder_ids: [CYL] })) }))).status).toBe(200);
    expect((await handler(gw)(post({ ...create, stops: [{ site_id: SITE, cylinder_ids: Array.from({ length: 200 }, () => CYL) }] }))).status).toBe(200);
  });

  it('observações vazias viram nulas e as paradas chegam ao banco na ordem', async () => {
    const gw = gateway();
    await handler(gw)(post({ ...create, notes: '   ' }));
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_notes: null, p_stops: [{ site_id: SITE, cylinder_ids: [CYL] }] });
  });

  it('update_trip leva a viagem, a versão e o id das paradas existentes', async () => {
    const gw = gateway({ code: 'UPDATED', version: 2 });
    const response = await handler(gw)(post(update));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 'UPDATED', version: 2 });
    expect(gw.rpc.mock.calls[0]).toEqual(['update_trip', expect.objectContaining({ p_trip: TRIP, p_expected_version: 1, p_stops: [{ id: STOP, site_id: SITE, cylinder_ids: [CYL] }] })]);
  });

  it.each([
    ['CREATED', 200], ['UPDATED', 200], ['REQUEST_REUSED', 409], ['CYLINDER_RESERVED', 409], ['CYLINDER_NOT_ELIGIBLE', 409], ['CAPACITY_EXCEEDED', 409],
    ['PARENT_INACTIVE', 409], ['VERSION_CONFLICT', 409], ['INVALID_TRANSITION', 409], ['TRIP_CLOSED', 409], ['RESOURCE_BUSY', 409], ['NOT_FOUND', 404],
    ['VALIDATION_FAILED', 400], ['ACCESS_DENIED', 403], ['AUTH_REQUIRED', 401],
  ])('o código %s do banco vira HTTP %i', async (code, status) => {
    const response = await handler(gateway({ code, trip_id: TRIP }))(post(create));
    expect(response.status).toBe(status);
  });

  it('erro do banco vira INTERNAL_ERROR, é auditado como falha e não vaza a mensagem', async () => {
    const gw = gateway({}, { rpc: vi.fn(async () => { throw new Error('rpc_failed: detalhe interno'); }) });
    const response = await handler(gw)(post(create));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('detalhe interno');
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.create', result: 'failed', reason: 'internal_error' });
  });

  it('observações nunca são registradas pela borda (a auditoria da borda só leva ação, resultado e motivo)', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await handler(gw)(post(create));
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('Levar rampa');
  });
});

// ----- Carregamento e início (US2) -----

describe('manage-trips: carregamento e início', () => {
  const ITEM = '9b000000-0000-4000-8000-000000000001';
  const base = { organization_id: ORG, request_id: REQUEST, trip_id: TRIP };
  const requests: Array<[string, Record<string, unknown>, string, Record<string, unknown>]> = [
    ['start_loading', { ...base, operation: 'start_loading', expected_version: 1 }, 'start_loading', { p_trip: TRIP, p_expected_version: 1, p_request: REQUEST }],
    ['revert_loading', { ...base, operation: 'revert_loading', expected_version: 2 }, 'revert_loading', { p_trip: TRIP, p_expected_version: 2 }],
    ['check_item', { ...base, operation: 'check_item', item_id: ITEM }, 'check_item', { p_trip: TRIP, p_item: ITEM }],
    ['uncheck_item', { ...base, operation: 'uncheck_item', item_id: ITEM }, 'uncheck_item', { p_trip: TRIP, p_item: ITEM }],
    ['remove_item', { ...base, operation: 'remove_item', item_id: ITEM, justification: '  Cilindro avariado  ' }, 'remove_item', { p_trip: TRIP, p_item: ITEM, p_justification: 'Cilindro avariado' }],
    ['start_trip', { ...base, operation: 'start_trip', expected_version: 3 }, 'start_trip', { p_trip: TRIP, p_expected_version: 3 }],
  ];

  it.each(requests)('%s chama a RPC com ator e sessão do token e os argumentos do contrato', async (_name, body, rpc, expected) => {
    const gw = gateway({ code: 'OK' });
    await handler(gw)(post({ ...body, actor: 'outro', p_actor: 'outro' }));
    const [name, args] = gw.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe(rpc);
    expect(args).toMatchObject({ p_actor: USER, p_session: SESSION, p_organization: ORG, ...expected });
    expect(JSON.stringify(args)).not.toContain('outro');
  });

  it.each(requests)('%s exige request_id e a viagem', async (_name, body) => {
    const gw = gateway();
    expect((await handler(gw)(post({ ...body, request_id: undefined }))).status).toBe(400);
    expect((await handler(gw)(post({ ...body, trip_id: 'x' }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('as operações com versão exigem expected_version e as de item exigem item_id', async () => {
    const gw = gateway();
    expect((await handler(gw)(post({ ...base, operation: 'start_trip' }))).status).toBe(400);
    expect((await handler(gw)(post({ ...base, operation: 'start_loading', expected_version: 0 }))).status).toBe(400);
    expect((await handler(gw)(post({ ...base, operation: 'check_item' }))).status).toBe(400);
    expect((await handler(gw)(post({ ...base, operation: 'remove_item', item_id: 'x', justification: 'Motivo válido' }))).status).toBe(400);
    expect((await handler(gw)(post({ ...base, operation: 'remove_item', item_id: ITEM, justification: 'j'.repeat(501) }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('remove_item sem justificativa vai ao banco, que responde JUSTIFICATION_REQUIRED', async () => {
    const gw = gateway({ code: 'JUSTIFICATION_REQUIRED' });
    const response = await handler(gw)(post({ ...base, operation: 'remove_item', item_id: ITEM }));
    expect(response.status).toBe(400);
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_justification: null });
  });

  it.each([
    ['LOADING', 200], ['REVERTED', 200], ['CHECKED', 200], ['UNCHECKED', 200], ['REMOVED', 200], ['STARTED', 200], ['ITEMS_PENDING', 409], ['INVALID_TRANSITION', 409],
    ['DRIVER_LICENSE_EXPIRED', 409], ['CYLINDER_NOT_ELIGIBLE', 409], ['RESOURCE_BUSY', 409], ['TRIP_CLOSED', 409], ['PARENT_INACTIVE', 409], ['ACCESS_DENIED', 403],
  ])('o código %s do banco vira HTTP %i', async (code, status) => {
    expect((await handler(gateway({ code, item_ids: [ITEM] }))(post({ ...base, operation: 'start_trip', expected_version: 1 }))).status).toBe(status);
  });

  it('a recusa de início traz os itens pendentes ao cliente', async () => {
    const response = await handler(gateway({ code: 'ITEMS_PENDING', item_ids: [ITEM] }))(post({ ...base, operation: 'start_trip', expected_version: 1 }));
    expect(await response.json()).toEqual({ code: 'ITEMS_PENDING', item_ids: [ITEM] });
  });

  it('a negação de uma operação de exceção é auditada com a ação certa', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await handler(gw)(post({ ...base, operation: 'remove_item', item_id: ITEM, justification: 'Motivo válido' }));
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.remove_item', result: 'denied', reason: 'permission_denied' });
    await handler(gw)(post({ ...base, operation: 'start_trip', expected_version: 1 }));
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.start', result: 'denied', reason: 'permission_denied' });
  });
});

// ----- Chegada e entrega (US3) -----

describe('manage-trips: chegada e entrega', () => {
  const STOP_ID = '9a000000-0000-4000-8000-000000000001';
  const ITEM_ID = '9b000000-0000-4000-8000-000000000001';
  const base = { organization_id: ORG, request_id: REQUEST, trip_id: TRIP, stop_id: STOP_ID };
  const delivery = {
    ...base, operation: 'register_delivery', delivered_at: '2026-10-09T15:30:00.000Z', recipient_name: '  Recebedor Fictício  ', recipient_role: 'Enfermeira',
    latitude: -23.55, longitude: -46.63, at_site_address: false, results: [{ item_id: ITEM_ID, delivered: true }, { item_id: '9b000000-0000-4000-8000-000000000002', delivered: false, reason: 'Sem espaço' }],
  };

  it('arrive_stop chama a RPC com a parada e o horário opcional', async () => {
    const gw = gateway({ code: 'ARRIVED', out_of_order: false });
    await handler(gw)(post({ ...base, operation: 'arrive_stop' }));
    await handler(gw)(post({ ...base, operation: 'arrive_stop', arrived_at: '2026-10-09T15:00:00Z' }));
    expect(gw.rpc.mock.calls[0]).toEqual(['arrive_stop', expect.objectContaining({ p_trip: TRIP, p_stop: STOP_ID, p_request: REQUEST, p_arrived_at: null })]);
    expect(gw.rpc.mock.calls[1]![1]).toMatchObject({ p_arrived_at: '2026-10-09T15:00:00Z' });
  });

  it('register_delivery leva o corpo do contrato, com o nome limpo e o resultado de cada cilindro', async () => {
    const gw = gateway({ code: 'DELIVERED', delivery_id: 'd1', stop_status: 'with_divergence', outside_geofence: false });
    const response = await handler(gw)(post(delivery));
    expect(response.status).toBe(200);
    expect(gw.rpc.mock.calls[0]).toEqual(['register_delivery', expect.objectContaining({
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_trip: TRIP, p_stop: STOP_ID, p_delivered_at: '2026-10-09T15:30:00.000Z', p_recipient_name: 'Recebedor Fictício',
      p_recipient_role: 'Enfermeira', p_latitude: -23.55, p_longitude: -46.63, p_at_site_address: false, p_supersedes: null,
      p_results: [{ item_id: ITEM_ID, delivered: true }, { item_id: '9b000000-0000-4000-8000-000000000002', delivered: false, reason: 'Sem espaço' }],
    })]);
  });

  it('a correção leva o registro que corrige', async () => {
    const gw = gateway({ code: 'DELIVERED' });
    await handler(gw)(post({ ...delivery, supersedes_id: 'd0000000-0000-4000-8000-000000000001' }));
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_supersedes: 'd0000000-0000-4000-8000-000000000001' });
  });

  it.each([
    ['sem request_id', { request_id: undefined }], ['horário inválido', { delivered_at: 'ontem' }], ['horário sem fuso', { delivered_at: '2026-10-09T15:30:00' }],
    ['sem nome', { recipient_name: undefined }], ['nome vazio', { recipient_name: '   ' }], ['nome com 121 caracteres', { recipient_name: 'n'.repeat(121) }],
    ['função com 81 caracteres', { recipient_role: 'f'.repeat(81) }], ['latitude fora do intervalo', { latitude: 91 }], ['longitude fora do intervalo', { longitude: -181 }],
    ['resultado sem entregue', { results: [{ item_id: ITEM_ID }] }], ['resultado com cilindro inválido', { results: [{ item_id: 'x', delivered: true }] }],
    ['motivo com 501 caracteres', { results: [{ item_id: ITEM_ID, delivered: false, reason: 'r'.repeat(501) }] }], ['sem resultados', { results: undefined }],
    ['parada inválida', { stop_id: 'x' }], ['correção inválida', { supersedes_id: 'x' }],
  ])('recusa %s antes de chegar ao banco', async (_label, patch) => {
    const gw = gateway();
    expect((await handler(gw)(post({ ...delivery, ...patch }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['ARRIVED', 200], ['DELIVERED', 200], ['STOP_CLOSED', 409], ['TRIP_CLOSED', 409], ['INVALID_TRANSITION', 409], ['VALIDATION_FAILED', 400], ['NOT_FOUND', 404], ['ACCESS_DENIED', 403],
  ])('o código %s do banco vira HTTP %i', async (code, status) => {
    expect((await handler(gateway({ code }))(post(delivery))).status).toBe(status);
  });

  it('o nome do recebedor não aparece na auditoria da borda nem na resposta de erro', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    const response = await handler(gw)(post(delivery));
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('Recebedor');
    expect(JSON.stringify(await response.json())).not.toContain('Recebedor');
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.deliver', result: 'denied', reason: 'permission_denied' });
  });

  it('erro interno do banco é auditado sem o corpo', async () => {
    const gw = gateway({}, { rpc: vi.fn(async () => { throw new Error('rpc_failed'); }) });
    expect((await handler(gw)(post(delivery))).status).toBe(500);
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('Recebedor');
  });
});

// ----- Desbloqueio (US4) -----

describe('manage-trips: desbloqueio', () => {
  const ITEM_ID = '9b000000-0000-4000-8000-000000000001';
  const unlock = { operation: 'register_unlock', organization_id: ORG, request_id: REQUEST, trip_id: TRIP, item_id: ITEM_ID, justification: '  Cilindro precisa voltar ao depósito  ' };

  it('chama a RPC com a viagem, o cilindro e a justificativa limpa', async () => {
    const gw = gateway({ code: 'UNLOCKED', exceptional: true });
    const response = await handler(gw)(post(unlock));
    expect(response.status).toBe(200);
    expect(gw.rpc.mock.calls[0]).toEqual(['register_unlock', expect.objectContaining({ p_actor: USER, p_session: SESSION, p_trip: TRIP, p_item: ITEM_ID, p_request: REQUEST, p_justification: 'Cilindro precisa voltar ao depósito' })]);
  });

  it('o desbloqueio normal vai sem justificativa e o segundo fator é decidido pelo banco, não pela borda', async () => {
    const gw = gateway({ code: 'UNLOCKED' });
    expect((await handler(gw)(post({ ...unlock, justification: undefined }))).status).toBe(200);
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_justification: null });
    const aal1 = gateway({ code: 'MFA_REQUIRED' });
    const response = await handler(aal1)(post(unlock));
    expect(response.status).toBe(403);
    expect(aal1.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([['sem request_id', { request_id: undefined }], ['sem cilindro', { item_id: undefined }], ['cilindro inválido', { item_id: 'x' }], ['justificativa com 501 caracteres', { justification: 'j'.repeat(501) }]])(
    'recusa %s antes de chegar ao banco',
    async (_label, patch) => {
      const gw = gateway();
      expect((await handler(gw)(post({ ...unlock, ...patch }))).status).toBe(400);
      expect(gw.rpc).not.toHaveBeenCalled();
    },
  );

  it.each([['UNLOCKED', 200], ['MFA_REQUIRED', 403], ['ACCESS_DENIED', 403], ['JUSTIFICATION_REQUIRED', 400], ['INVALID_TRANSITION', 409], ['NOT_FOUND', 404]])('o código %s do banco vira HTTP %i', async (code, status) => {
    expect((await handler(gateway({ code }))(post(unlock))).status).toBe(status);
  });

  it('não existe operação de refazer o bloqueio', async () => {
    const gw = gateway();
    for (const operation of ['relock', 'relock_item', 'lock_item', 'set_lock', 'reblock', 'lock']) expect((await handler(gw)(post({ ...unlock, operation }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('a justificativa não vai à auditoria da borda', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await handler(gw)(post(unlock));
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('depósito');
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.unlock', result: 'denied', reason: 'permission_denied' });
  });
});

// ----- Encerramento (US5) -----

describe('manage-trips: concluir, cancelar e devolver ao estoque', () => {
  const ITEM_ID = '9b000000-0000-4000-8000-000000000001';
  const base = { organization_id: ORG, request_id: REQUEST, trip_id: TRIP };

  it('complete_trip leva a viagem e a versão esperada', async () => {
    const gw = gateway({ code: 'COMPLETED', version: 6 });
    expect((await handler(gw)(post({ ...base, operation: 'complete_trip', expected_version: 5 }))).status).toBe(200);
    expect(gw.rpc.mock.calls[0]).toEqual(['complete_trip', expect.objectContaining({ p_trip: TRIP, p_expected_version: 5, p_request: REQUEST })]);
  });

  it('cancel_trip e return_item levam a justificativa limpa', async () => {
    const gw = gateway({ code: 'OK' });
    await handler(gw)(post({ ...base, operation: 'cancel_trip', expected_version: 2, justification: '  Cliente desistiu  ' }));
    await handler(gw)(post({ ...base, operation: 'return_item', item_id: ITEM_ID, justification: '  Volta ao depósito  ' }));
    expect(gw.rpc.mock.calls[0]).toEqual(['cancel_trip', expect.objectContaining({ p_trip: TRIP, p_expected_version: 2, p_justification: 'Cliente desistiu' })]);
    expect(gw.rpc.mock.calls[1]).toEqual(['return_item', expect.objectContaining({ p_trip: TRIP, p_item: ITEM_ID, p_justification: 'Volta ao depósito' })]);
  });

  it('a justificativa vazia vai ao banco, que responde JUSTIFICATION_REQUIRED', async () => {
    const gw = gateway({ code: 'JUSTIFICATION_REQUIRED' });
    expect((await handler(gw)(post({ ...base, operation: 'cancel_trip', expected_version: 2 }))).status).toBe(400);
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_justification: null });
  });

  it.each([
    ['sem request_id', { operation: 'complete_trip', expected_version: 1, request_id: undefined }], ['complete sem versão', { operation: 'complete_trip' }],
    ['cancel sem versão', { operation: 'cancel_trip', justification: 'Motivo válido' }], ['cancel com justificativa de 501 caracteres', { operation: 'cancel_trip', expected_version: 1, justification: 'j'.repeat(501) }],
    ['return sem cilindro', { operation: 'return_item', justification: 'Motivo válido' }], ['return com cilindro inválido', { operation: 'return_item', item_id: 'x', justification: 'Motivo válido' }],
  ])('recusa %s antes de chegar ao banco', async (_label, patch) => {
    const gw = gateway();
    expect((await handler(gw)(post({ ...base, ...patch }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['COMPLETED', 200], ['CANCELLED', 200], ['RETURNED', 200], ['STOPS_OPEN', 409], ['TRIP_CLOSED', 409], ['INVALID_TRANSITION', 409], ['VERSION_CONFLICT', 409],
    ['JUSTIFICATION_REQUIRED', 400], ['ACCESS_DENIED', 403], ['NOT_FOUND', 404],
  ])('o código %s do banco vira HTTP %i', async (code, status) => {
    expect((await handler(gateway({ code, stop_ids: ['s1'] }))(post({ ...base, operation: 'complete_trip', expected_version: 1 }))).status).toBe(status);
  });

  it('STOPS_OPEN traz as paradas em aberto', async () => {
    const response = await handler(gateway({ code: 'STOPS_OPEN', stop_ids: ['9a000000-0000-4000-8000-000000000001'] }))(post({ ...base, operation: 'complete_trip', expected_version: 1 }));
    expect(await response.json()).toEqual({ code: 'STOPS_OPEN', stop_ids: ['9a000000-0000-4000-8000-000000000001'] });
  });

  it('a justificativa não vai à auditoria da borda e as ações têm o nome certo', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await handler(gw)(post({ ...base, operation: 'cancel_trip', expected_version: 1, justification: 'Cliente desistiu da entrega' }));
    await handler(gw)(post({ ...base, operation: 'return_item', item_id: ITEM_ID, justification: 'Volta ao depósito' }));
    await handler(gw)(post({ ...base, operation: 'complete_trip', expected_version: 1 }));
    expect(JSON.stringify(gw.audit.mock.calls)).not.toMatch(/desistiu|depósito/);
    expect(gw.audit.mock.calls.map((call) => (call[0] as { action: string }).action)).toEqual(['trip.cancel', 'trip.return_item', 'trip.complete']);
  });
});
