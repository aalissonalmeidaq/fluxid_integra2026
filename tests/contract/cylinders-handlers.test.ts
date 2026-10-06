// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryCylindersHandler } from '../../supabase/functions/query-cylinders/handler';
import { createManageCylindersHandler } from '../../supabase/functions/manage-cylinders/handler';
import type { CylinderGateway } from '../../supabase/functions/_shared/cylinders';

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000600a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const OTHER_ORG = '20000000-0000-4000-8000-00000000000b';
const CYL = '72000000-0000-4000-8000-0000000000a1';
const KEY = '9b2f6d52-6f5a-4a58-8d31-0f8d9f0b4c11';

const gateway = (result: Record<string, unknown> = { code: 'OK' }, overrides: Partial<CylinderGateway> = {}): CylinderGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
  ...overrides,
}) as never;

const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });

describe('manage-cylinders: borda comum', () => {
  it('só aceita POST', async () => {
    const response = await createManageCylindersHandler(gateway())(post({}, 'jwt', 'GET'));
    expect(response.status).toBe(405);
  });

  it('responde ao preflight', async () => {
    const response = await createManageCylindersHandler(gateway())(new Request('http://local/fn', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
  });

  it('sem token ou com token inválido: 401 e nenhuma chamada ao banco', async () => {
    const gw = gateway();
    expect((await createManageCylindersHandler(gw)(post({ operation: 'stock_in' }, ''))).status).toBe(401);
    const invalid = gateway({}, { authenticate: vi.fn(async () => null) });
    expect((await createManageCylindersHandler(invalid)(post({ operation: 'stock_in' }))).status).toBe(401);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(invalid.rpc).not.toHaveBeenCalled();
  });

  it('corpo inválido ou organização que não é UUID: 400', async () => {
    const gw = gateway();
    const handler = createManageCylindersHandler(gw);
    expect((await handler(new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'não é json' }))).status).toBe(400);
    expect((await handler(post({ operation: 'stock_in', organization_id: 'abc', identifier_value: 'QR-1', operation_key: KEY }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each(['delete', 'delete_cylinder', 'remove_identifier', 'purge', 'truncate', 'desconhecida'])('operação "%s" não existe: 400 e auditada como negada (CA-003)', async (operation) => {
    const gw = gateway();
    const response = await createManageCylindersHandler(gw)(post({ operation, organization_id: ORG, cylinder_id: CYL }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'VALIDATION_FAILED' });
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'cylinder.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('o ator e a sessão vêm do token, nunca do corpo (RF-043)', async () => {
    const gw = gateway({ code: 'STOCKED', replayed: false });
    await createManageCylindersHandler(gw)(post({ operation: 'stock_in', organization_id: ORG, identifier_value: 'QR-1', operation_key: KEY, actor_id: OTHER_ORG, p_actor: OTHER_ORG, session_id: OTHER_ORG }));
    expect(gw.rpc).toHaveBeenCalledWith('stock_in_cylinder', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_identifier_value: 'QR-1', p_operation_key: KEY });
  });

  it('negação do banco vira 403 e é auditada sem a organização pedida', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    const response = await createManageCylindersHandler(gw)(post({ operation: 'stock_in', organization_id: OTHER_ORG, identifier_value: 'QR-1', operation_key: KEY }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'ACCESS_DENIED' });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'cylinder.stock_in', result: 'denied', reason: 'permission_denied' });
  });

  it('sessão sem validade no banco: 401', async () => {
    const response = await createManageCylindersHandler(gateway({ code: 'AUTH_REQUIRED' }))(post({ operation: 'stock_in', organization_id: ORG, identifier_value: 'QR-1', operation_key: KEY }));
    expect(response.status).toBe(401);
  });

  it('cilindro de outra organização e cilindro inexistente têm a mesma resposta (RF-042)', async () => {
    const other = await createManageCylindersHandler(gateway({ code: 'NOT_FOUND' }))(post({ operation: 'reactivate', organization_id: ORG, cylinder_id: CYL, justification: 'foi engano' }));
    const missing = await createManageCylindersHandler(gateway({ code: 'NOT_FOUND' }))(post({ operation: 'reactivate', organization_id: ORG, cylinder_id: '72000000-0000-4000-8000-0000000000ff', justification: 'foi engano' }));
    expect(other.status).toBe(404);
    expect(other.status).toBe(missing.status);
    expect(await other.json()).toEqual(await missing.json());
  });

  it.each([
    ['SERIAL_CONFLICT', 409], ['IDENTIFIER_CONFLICT', 409], ['IDENTIFIER_UNAVAILABLE', 409], ['VERSION_CONFLICT', 409], ['CYLINDER_INACTIVE', 409],
    ['ALREADY_IN_STOCK', 409], ['ALREADY_INACTIVE', 409], ['IDEMPOTENCY_PAYLOAD_CONFLICT', 409], ['VALIDATION_FAILED', 400], ['JUSTIFICATION_REQUIRED', 400],
  ])('código %s vira HTTP %i e preserva os detalhes do banco', async (code, status) => {
    const response = await createManageCylindersHandler(gateway({ code, cylinder_id: CYL }))(post({ operation: 'inactivate', organization_id: ORG, cylinder_id: CYL, reason: 'lost', justification: 'motivo ok' }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code, cylinder_id: CYL });
  });

  it('falha do banco: 500 sem detalhe e auditoria "failed"', async () => {
    const gw = gateway({}, { rpc: vi.fn(async () => { throw new Error('detalhe interno'); }) });
    const response = await createManageCylindersHandler(gw)(post({ operation: 'stock_in', organization_id: ORG, identifier_value: 'QR-1', operation_key: KEY }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'cylinder.stock_in', result: 'failed', reason: 'internal_error' });
  });

  it('código desconhecido vindo do banco não vaza: 500', async () => {
    const response = await createManageCylindersHandler(gateway({ code: 'ALGO_NOVO', segredo: 'x' }))(post({ operation: 'stock_in', organization_id: ORG, identifier_value: 'QR-1', operation_key: KEY }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' });
  });
});

describe('manage-cylinders: validação por operação', () => {
  const run = (body: Record<string, unknown>) => {
    const gw = gateway({ code: 'OK' });
    return createManageCylindersHandler(gw)(post({ organization_id: ORG, ...body })).then(async (response) => ({ response, gw, json: await response.json() as Record<string, unknown> }));
  };

  it('stock_in exige a chave de operação em UUID e o identificador', async () => {
    const semChave = await run({ operation: 'stock_in', identifier_value: 'QR-1' });
    expect(semChave.response.status).toBe(400);
    expect(semChave.json.code).toBe('VALIDATION_FAILED');
    const chaveRuim = await run({ operation: 'stock_in', identifier_value: 'QR-1', operation_key: 'abc' });
    expect(chaveRuim.response.status).toBe(400);
    const semValor = await run({ operation: 'stock_in', operation_key: KEY });
    expect(semValor.response.status).toBe(400);
    expect(semValor.gw.rpc).not.toHaveBeenCalled();
  });

  it('identificador com quebra de linha ou acima de 200 caracteres é recusado antes do banco', async () => {
    expect((await run({ operation: 'stock_in', identifier_value: 'QR\n1', operation_key: KEY })).response.status).toBe(400);
    expect((await run({ operation: 'stock_in', identifier_value: 'Q'.repeat(201), operation_key: KEY })).response.status).toBe(400);
  });

  it('create leva o primeiro identificador e repassa os campos ao banco', async () => {
    const { gw, response } = await run({
      operation: 'create', cylinder_type_id: '71000000-0000-4000-8000-0000000000a1', serial_number: 'AB-1', manufacturer: null,
      manufacture_year: 2020, working_pressure_bar: 200.5, notes: 'ok', identifier: { kind: 'qr_code', value: 'QR-1' },
    });
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('create_cylinder', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_type: '71000000-0000-4000-8000-0000000000a1', p_serial: 'AB-1',
      p_manufacturer: null, p_year: 2020, p_pressure: 200.5, p_notes: 'ok', p_identifier_kind: 'qr_code', p_identifier_value: 'QR-1',
    });
  });

  it('create recusa tipo de identificador desconhecido e número de série ausente', async () => {
    const tipo = await run({ operation: 'create', cylinder_type_id: '71000000-0000-4000-8000-0000000000a1', serial_number: 'AB-1', identifier: { kind: 'barcode', value: 'X' } });
    expect(tipo.response.status).toBe(400);
    const serie = await run({ operation: 'create', cylinder_type_id: '71000000-0000-4000-8000-0000000000a1', identifier: { kind: 'qr_code', value: 'X' } });
    expect(serie.response.status).toBe(400);
    expect(JSON.stringify(serie.json)).toContain('serial_number');
  });

  it('inactivate exige motivo da lista e justificativa de texto', async () => {
    expect((await run({ operation: 'inactivate', cylinder_id: CYL, reason: 'vendido', justification: 'motivo ok' })).response.status).toBe(400);
    expect((await run({ operation: 'inactivate', cylinder_id: CYL, reason: 'lost' })).response.status).toBe(400);
    expect((await run({ operation: 'inactivate', cylinder_id: CYL, reason: 'lost', justification: 'motivo ok' })).response.status).toBe(200);
  });

  it('transfer_identifier exige confirmação explícita', async () => {
    const semConfirmar = await run({ operation: 'transfer_identifier', value: 'N1', target_cylinder_id: CYL, justification: 'reaproveitada', confirmed: false });
    expect(semConfirmar.response.status).toBe(400);
    const confirmado = await run({ operation: 'transfer_identifier', value: 'N1', target_cylinder_id: CYL, justification: 'reaproveitada', confirmed: true });
    expect(confirmado.response.status).toBe(200);
    expect(confirmado.gw.rpc).toHaveBeenCalledWith('transfer_cylinder_identifier', expect.objectContaining({ p_value: 'N1', p_target: CYL, p_confirmed: true }));
  });

  it('register_test aceita datas ISO e rejeita datas inexistentes', async () => {
    const base = { operation: 'register_test', cylinder_id: CYL, result: 'approved', executor: 'Lab', next_due_on: '2027-10-01' };
    expect((await run({ ...base, performed_on: '2026-10-01' })).response.status).toBe(200);
    expect((await run({ ...base, performed_on: '2026-02-31' })).response.status).toBe(400);
    expect((await run({ ...base, performed_on: '01/10/2026' })).response.status).toBe(400);
  });

  it('update leva a versão esperada como inteiro positivo', async () => {
    const base = { operation: 'update', cylinder_id: CYL, cylinder_type_id: '71000000-0000-4000-8000-0000000000a1', serial_number: 'AB-1' };
    expect((await run({ ...base, expected_version: 0 })).response.status).toBe(400);
    expect((await run({ ...base, expected_version: 1.5 })).response.status).toBe(400);
    expect((await run({ ...base, expected_version: 3 })).response.status).toBe(200);
  });
});

describe('manage-cylinders: nomes das ações auditadas', () => {
  it('cada comando usa o mesmo nome de ação que a RPC grava no sucesso (CA-005)', async () => {
    const { MANAGE_OPERATIONS } = await import('../../supabase/functions/manage-cylinders/handler');
    expect(Object.values(MANAGE_OPERATIONS).map((operation) => operation.action).sort()).toEqual([
      'cylinder.create', 'cylinder.identifier_add', 'cylinder.identifier_deactivate', 'cylinder.identifier_transfer', 'cylinder.inactivate',
      'cylinder.reactivate', 'cylinder.stock_in', 'cylinder.test_rectify', 'cylinder.test_register', 'cylinder.type_save', 'cylinder.update',
    ]);
  });

  it('a negação de um comando é auditada com o nome canônico da ação', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    await createManageCylindersHandler(gw)(post({ operation: 'register_test', organization_id: ORG, cylinder_id: CYL, performed_on: '2026-10-01', result: 'rejected', executor: 'Lab' }));
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'cylinder.test_register', result: 'denied', reason: 'permission_denied' });
  });
});

describe('query-cylinders', () => {
  const run = (body: Record<string, unknown>, result: Record<string, unknown> = { code: 'LISTED', items: [], total: 0, next: null }) => {
    const gw = gateway(result);
    return createQueryCylindersHandler(gw)(post({ organization_id: ORG, ...body })).then(async (response) => ({ response, gw, json: await response.json() as Record<string, unknown> }));
  };

  it('list repassa busca, filtros e paginação ao banco', async () => {
    const { gw, response } = await run({ operation: 'list', search: 'QR-1', status: 'all', stock_status: 'in_stock', hydro_status: 'vencido', limit: 25, cursor: 'abc' });
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('query_cylinders_list', expect.objectContaining({
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_search: 'QR-1', p_status: 'all', p_stock_status: 'in_stock', p_hydro_status: 'vencido', p_limit: 25, p_cursor: 'abc',
    }));
  });

  it('list limita o tamanho da página a 100 e recusa filtros desconhecidos', async () => {
    expect((await run({ operation: 'list', limit: 101 })).response.status).toBe(400);
    expect((await run({ operation: 'list', limit: 0 })).response.status).toBe(400);
    expect((await run({ operation: 'list', status: 'tudo' })).response.status).toBe(400);
    expect((await run({ operation: 'list', hydro_status: 'quase' })).response.status).toBe(400);
  });

  it('get, lookup, history e catalog chamam as funções certas', async () => {
    const get = await run({ operation: 'get', cylinder_id: CYL }, { code: 'FOUND' });
    expect(get.gw.rpc).toHaveBeenCalledWith('query_cylinder_get', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_cylinder: CYL });
    const lookup = await run({ operation: 'lookup', identifier_value: 'NFC-1' }, { code: 'FOUND' });
    expect(lookup.gw.rpc).toHaveBeenCalledWith('query_cylinder_lookup', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_identifier_value: 'NFC-1' });
    const history = await run({ operation: 'history', cylinder_id: CYL, order: 'asc', event_type: 'stock_in' }, { code: 'LISTED', events: [], next: null });
    expect(history.gw.rpc).toHaveBeenCalledWith('query_cylinder_history', expect.objectContaining({ p_cylinder: CYL, p_order: 'asc', p_event_type: 'stock_in' }));
    const catalog = await run({ operation: 'catalog' }, { code: 'LISTED', types: [] });
    expect(catalog.gw.rpc).toHaveBeenCalledWith('query_cylinder_catalog', { p_actor: USER, p_session: SESSION, p_organization: ORG });
  });

  it('history recusa ordem e tipo de evento desconhecidos', async () => {
    expect((await run({ operation: 'history', cylinder_id: CYL, order: 'random' })).response.status).toBe(400);
    expect((await run({ operation: 'history', cylinder_id: CYL, event_type: 'cylinder_apagado' })).response.status).toBe(400);
  });

  it('operação de comando não existe na função de consulta e é auditada como negada', async () => {
    const { response, gw } = await run({ operation: 'create' });
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'cylinder.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('acesso negado: 403 e auditoria; não encontrado: 404 igual para inexistente e de outra organização', async () => {
    const denied = await run({ operation: 'list' }, { code: 'ACCESS_DENIED' });
    expect(denied.response.status).toBe(403);
    expect(denied.gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'cylinder.list', result: 'denied', reason: 'permission_denied' });
    const missing = await run({ operation: 'get', cylinder_id: CYL }, { code: 'NOT_FOUND' });
    expect(missing.response.status).toBe(404);
    expect(missing.json).toEqual({ code: 'NOT_FOUND' });
  });

  it('lookup de identificador desativado informa o cilindro de origem (404 com detalhes)', async () => {
    const { response, json } = await run({ operation: 'lookup', identifier_value: 'NFC-1' }, { code: 'NOT_FOUND', deactivated: true, cylinder: { id: CYL, serial_number: 'AB-1' } });
    expect(response.status).toBe(404);
    expect(json).toMatchObject({ code: 'NOT_FOUND', deactivated: true, cylinder: { id: CYL } });
  });
});
