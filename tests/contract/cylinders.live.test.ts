// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, restGet, type FunctionResponse } from '../support/auth-harness';

// Spec 006, contra o Supabase local real (Auth, sessões governadas, Edge Functions, RPCs, RLS e gatilhos). Exige o seed
// determinístico e as funções query-cylinders e manage-cylinders carregadas (supabase stop/start). Cada suíte usa usuários próprios
// dos Tenants E e F, porque as sessões são limitadas por usuário (3 simultâneas).
const E = '20000000-0000-0000-0000-00000000000e';
const F = '20000000-0000-0000-0000-00000000000f';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY ?? '';

const cylE = { email: 'cyl-e-admin@example.invalid', password: 'Local-only-017!' };
const cylF = { email: 'cyl-f-admin@example.invalid', password: 'Local-only-018!' };
const stockE = { email: 'cyl-e-stock@example.invalid', password: 'Local-only-019!' };

const run = `${Date.now().toString(36)}`;
const token = (response: FunctionResponse): string => response.body.session.access_token as string;
const manage = (accessToken: string, body: Record<string, unknown>) => callFunction('manage-cylinders', body, accessToken);
const query = (accessToken: string, body: Record<string, unknown>) => callFunction('query-cylinders', body, accessToken);

async function newType(accessToken: string, organization: string): Promise<string> {
  const response = await manage(accessToken, { operation: 'save_type', organization_id: organization, gas: `Gás ${run}`, capacity_value: 10, capacity_unit: 'l', classification: 'medicinal' });
  expect(response.status).toBe(200);
  return response.body.type_id as string;
}

async function newCylinder(accessToken: string, organization: string, type: string, serial: string, identifier: string): Promise<string> {
  const response = await manage(accessToken, {
    operation: 'create', organization_id: organization, cylinder_type_id: type, serial_number: serial, identifier: { kind: 'qr_code', value: identifier },
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.cylinder_id as string;
}

describe('Cilindros ao vivo (Spec 006)', () => {
  let tokenE: string;
  let tokenE2: string;
  let tokenF: string;
  let tokenStock: string;
  let typeE: string;
  let typeF: string;

  beforeAll(async () => {
    for (const credentials of [cylE, cylF, stockE]) await endAllSessions(credentials);
    tokenE = token(await login(cylE));
    tokenE2 = token(await login(cylE));
    tokenF = token(await login(cylF));
    tokenStock = token(await login(stockE));
    typeE = await newType(tokenE, E);
    typeF = await newType(tokenF, F);
  });

  afterAll(async () => {
    for (const accessToken of [tokenE, tokenE2, tokenF, tokenStock]) if (accessToken) await logout(accessToken);
  });

  it('exige autenticação e rejeita operação de exclusão ou desconhecida', async () => {
    expect((await callFunction('manage-cylinders', { operation: 'create' })).status).toBe(401);
    for (const operation of ['delete', 'delete_cylinder', 'purge']) {
      const response = await manage(tokenE, { operation, organization_id: E, cylinder_id: '72000000-0000-4000-8000-0000000000a1' });
      expect(response.status).toBe(400);
    }
    // A auditoria da tentativa (cylinder.unknown_operation, negada, sem organização solicitada) é conferida no teste do manipulador.
  });

  it('cadastra, lista, busca por identificador e abre o detalhe (RF-001, RF-012, RF-028)', async () => {
    const serial = `LIVE-${run}-A`;
    const id = await newCylinder(tokenE, E, typeE, serial, `QR-${run}-A`);
    const found = await query(tokenE, { operation: 'lookup', organization_id: E, identifier_value: `  qr-${run}-a ` });
    expect(found.status).toBe(200);
    expect(found.body.cylinder.id).toBe(id);
    const list = await query(tokenE, { operation: 'list', organization_id: E, search: serial.toLowerCase() });
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toContain(id);
    const detail = await query(tokenE, { operation: 'get', organization_id: E, cylinder_id: id });
    expect(detail.body.cylinder.serial_number).toBe(serial);
    expect(detail.body.identifiers).toHaveLength(1);
  });

  it('10 repetições da mesma entrada = 1 evento e a mesma resposta (CA-002, MS-003)', async () => {
    const id = await newCylinder(tokenE, E, typeE, `LIVE-${run}-IDEM`, `QR-${run}-IDEM`);
    const operationKey = crypto.randomUUID();
    const responses: FunctionResponse[] = [];
    for (let n = 0; n < 10; n += 1) responses.push(await manage(tokenStock, { operation: 'stock_in', organization_id: E, identifier_value: `QR-${run}-IDEM`, operation_key: operationKey }));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.filter((response) => response.body.replayed === true)).toHaveLength(9);
    expect(new Set(responses.map((response) => JSON.stringify({ ...response.body, replayed: undefined }))).size).toBe(1);
    const history = await query(tokenE, { operation: 'history', organization_id: E, cylinder_id: id, event_type: 'stock_in' });
    expect(history.body.events).toHaveLength(1);
    const other = await manage(tokenStock, { operation: 'stock_in', organization_id: E, identifier_value: `QR-${run}-IDEM`, operation_key: crypto.randomUUID() });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('ALREADY_IN_STOCK');
  });

  it('a mesma chave enviada ao mesmo tempo por duas sessões gera um único evento', async () => {
    const id = await newCylinder(tokenE, E, typeE, `LIVE-${run}-PAR`, `QR-${run}-PAR`);
    const operationKey = crypto.randomUUID();
    const [a, b] = await Promise.all([
      manage(tokenE, { operation: 'stock_in', organization_id: E, identifier_value: `QR-${run}-PAR`, operation_key: operationKey }),
      manage(tokenE2, { operation: 'stock_in', organization_id: E, identifier_value: `QR-${run}-PAR`, operation_key: operationKey }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.replayed, b.body.replayed].sort()).toEqual([false, true]);
    const history = await query(tokenE, { operation: 'history', organization_id: E, cylinder_id: id, event_type: 'stock_in' });
    expect(history.body.events).toHaveLength(1);
  });

  it('duas sessões cadastrando o mesmo número de série ao mesmo tempo: uma é aceita e a outra recebe o conflito', async () => {
    const body = (identifier: string) => ({ operation: 'create', organization_id: E, cylinder_type_id: typeE, serial_number: `LIVE-${run}-RACE`, identifier: { kind: 'qr_code', value: identifier } });
    const [a, b] = await Promise.all([manage(tokenE, body(`QR-${run}-RACE-1`)), manage(tokenE2, body(`QR-${run}-RACE-2`))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('SERIAL_CONFLICT');
    const list = await query(tokenE, { operation: 'list', organization_id: E, search: `LIVE-${run}-RACE` });
    expect(list.body.total).toBe(1);
  });

  it('duas sessões usando o mesmo identificador em cilindros diferentes ao mesmo tempo: um vence', async () => {
    const body = (serial: string) => ({ operation: 'create', organization_id: E, cylinder_type_id: typeE, serial_number: serial, identifier: { kind: 'qr_code', value: `QR-${run}-SHARED` } });
    const [a, b] = await Promise.all([manage(tokenE, body(`LIVE-${run}-S1`)), manage(tokenE2, body(`LIVE-${run}-S2`))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].find((response) => response.status === 409)?.body.code).toBe('IDENTIFIER_CONFLICT');
  });

  it('duas sessões inativando o mesmo cilindro ao mesmo tempo: a segunda recebe o aviso de que já está inativo', async () => {
    const id = await newCylinder(tokenE, E, typeE, `LIVE-${run}-INA`, `QR-${run}-INA`);
    const body = { operation: 'inactivate', organization_id: E, cylinder_id: id, reason: 'lost', justification: 'Perdido durante a entrega' };
    const [a, b] = await Promise.all([manage(tokenE, body), manage(tokenE2, body)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].find((response) => response.status === 409)?.body.code).toBe('ALREADY_INACTIVE');
    const detail = await query(tokenE, { operation: 'get', organization_id: E, cylinder_id: id });
    expect(detail.body.cylinder.status).toBe('inactive');
    expect(detail.body.identifiers[0].status).toBe('active');
  });

  it('edição simultânea sobre a mesma versão: uma é aceita e a outra recebe VERSION_CONFLICT (RF-004, RNF-005)', async () => {
    const id = await newCylinder(tokenE, E, typeE, `LIVE-${run}-VER`, `QR-${run}-VER`);
    const edit = (manufacturer: string) => ({ operation: 'update', organization_id: E, cylinder_id: id, expected_version: 1, cylinder_type_id: typeE, serial_number: `LIVE-${run}-VER`, manufacturer });
    const [a, b] = await Promise.all([manage(tokenE, edit('Fábrica 1')), manage(tokenE2, edit('Fábrica 2'))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].find((response) => response.status === 409)?.body.code).toBe('VERSION_CONFLICT');
  });

  it('isolamento: o Tenant F não vê, não busca nem altera cilindros do Tenant E, e a negação é igual à de inexistente (RF-042)', async () => {
    const id = await newCylinder(tokenE, E, typeE, `LIVE-${run}-ISO`, `QR-${run}-ISO`);
    const fromF = await query(tokenF, { operation: 'get', organization_id: F, cylinder_id: id });
    const missing = await query(tokenF, { operation: 'get', organization_id: F, cylinder_id: '72000000-0000-4000-8000-00000000ffff' });
    expect(fromF.status).toBe(404);
    expect(fromF.body).toEqual(missing.body);
    expect((await query(tokenF, { operation: 'lookup', organization_id: F, identifier_value: `QR-${run}-ISO` })).status).toBe(404);
    expect((await query(tokenF, { operation: 'list', organization_id: F, search: `LIVE-${run}-ISO` })).body.total).toBe(0);
    expect((await manage(tokenF, { operation: 'inactivate', organization_id: F, cylinder_id: id, reason: 'lost', justification: 'Tentativa de outro tenant' })).status).toBe(404);
    // Pedir o contexto de outra organização é negado.
    expect((await query(tokenF, { operation: 'get', organization_id: E, cylinder_id: id })).status).toBe(403);
    expect((await manage(tokenF, { operation: 'create', organization_id: E, cylinder_type_id: typeE, serial_number: 'X', identifier: { kind: 'qr_code', value: 'X' } })).status).toBe(403);
    // O mesmo número de série e o mesmo identificador no Tenant F são aceitos.
    expect(await newCylinder(tokenF, F, typeF, `LIVE-${run}-ISO`, `QR-${run}-ISO`)).not.toBe(id);
  });

  it('a tabela não aceita escrita direta pelo cliente nem leitura sem permissão (RLS e privilégios)', async () => {
    const id = await newCylinder(tokenE, E, typeE, `LIVE-${run}-RLS`, `QR-${run}-RLS`);
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/cylinders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: PUBLISHABLE_KEY, authorization: `Bearer ${tokenE}` },
      body: JSON.stringify({ organization_id: E, cylinder_type_id: typeE, serial_number: `DIRETO-${run}` }),
    });
    expect([401, 403]).toContain(insert.status);
    for (const method of ['PATCH', 'DELETE']) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/cylinders?id=eq.${id}`, {
        method, headers: { 'content-type': 'application/json', apikey: PUBLISHABLE_KEY, authorization: `Bearer ${tokenE}` }, body: method === 'PATCH' ? JSON.stringify({ notes: 'x' }) : undefined,
      });
      expect([401, 403, 404], `${method} direto em cylinders`).toContain(response.status);
    }
    const other = await restGet(`cylinders?id=eq.${id}&select=id`, tokenF);
    expect(other.status).toBe(200);
    expect(other.body).toEqual([]);
    const events = await restGet(`cylinder_events?cylinder_id=eq.${id}&select=id`, tokenE);
    expect((events.body as unknown[]).length).toBeGreaterThan(0);
    const del = await fetch(`${SUPABASE_URL}/rest/v1/cylinder_events?cylinder_id=eq.${id}`, { method: 'DELETE', headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${tokenE}` } });
    expect([401, 403]).toContain(del.status);
    expect(((await restGet(`cylinder_events?cylinder_id=eq.${id}&select=id`, tokenE)).body as unknown[]).length).toBeGreaterThan(0);
  });

  it('o estoquista não tem as permissões de inativar nem de registrar teste, e cada recusa vem do servidor', async () => {
    const id = await newCylinder(tokenStock, E, typeE, `LIVE-${run}-PERM`, `QR-${run}-PERM`);
    expect((await manage(tokenStock, { operation: 'inactivate', organization_id: E, cylinder_id: id, reason: 'lost', justification: 'Sem permissão para isso' })).status).toBe(403);
    expect((await manage(tokenStock, { operation: 'register_test', organization_id: E, cylinder_id: id, performed_on: '2026-01-01', result: 'rejected', executor: 'Lab' })).status).toBe(403);
    expect((await query(tokenStock, { operation: 'history', organization_id: E, cylinder_id: id })).status).toBe(200);
  });

  it('transferência de identificador e histórico nos dois cilindros (RF-011)', async () => {
    const typeId = typeE;
    const source = await newCylinder(tokenE, E, typeId, `LIVE-${run}-T1`, `QR-${run}-T1`);
    const target = await newCylinder(tokenE, E, typeId, `LIVE-${run}-T2`, `QR-${run}-T2`);
    const detail = await query(tokenE, { operation: 'get', organization_id: E, cylinder_id: source });
    const identifierId = detail.body.identifiers[0].id as string;
    expect((await manage(tokenE, { operation: 'transfer_identifier', organization_id: E, value: `QR-${run}-T1`, target_cylinder_id: target, justification: 'Reaproveitamento', confirmed: true })).status).toBe(409);
    expect((await manage(tokenE, { operation: 'deactivate_identifier', organization_id: E, identifier_id: identifierId, justification: 'Etiqueta danificada' })).status).toBe(200);
    const moved = await manage(tokenE, { operation: 'transfer_identifier', organization_id: E, value: `QR-${run}-T1`, target_cylinder_id: target, justification: 'Reaproveitamento', confirmed: true });
    expect(moved.status).toBe(200);
    expect((await query(tokenE, { operation: 'lookup', organization_id: E, identifier_value: `QR-${run}-T1` })).body.cylinder.id).toBe(target);
    const out = await query(tokenE, { operation: 'history', organization_id: E, cylinder_id: source, event_type: 'identifier_transferred_out' });
    const into = await query(tokenE, { operation: 'history', organization_id: E, cylinder_id: target, event_type: 'identifier_transferred_in' });
    expect(out.body.events).toHaveLength(1);
    expect(into.body.events).toHaveLength(1);
  });
});
