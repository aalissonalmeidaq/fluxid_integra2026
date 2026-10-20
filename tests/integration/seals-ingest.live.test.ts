// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, publishableKey, supabaseUrl, USERS } from '../support/auth-harness';
import { bindTestDevice, createTestCylinder, createTestDevice, loadSealFixtures, sql } from '../support/seal-db';
import { SealSimulator } from '../support/seal-simulator';

// Spec 012, US1 (T040), contra o Supabase local real: o simulador envia posições de dois lacres de organizações diferentes, inclusive
// repetidas, reenviadas e em lote; cada posição é guardada uma vez na organização certa; o aviso em tempo real chega a quem é do tenant
// e não ao outro; da chamada do lacre até a consulta da tela em até 10 s; resposta ao lacre em até 3 s (MS-001, MS-002, RNF-001,
// RNF-002). Exige as funções seal-gateway e query-seals carregadas (supabase stop/start).
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ORG_B = '20000000-0000-0000-0000-00000000000b';
const ADMIN_B = '10000000-0000-0000-0000-000000000003';
const run = Date.now().toString(36).toUpperCase();

let tokenA = '';
let tokenB = '';
let refreshA = '';
let refreshB = '';
let cylA = '';
let devA = { device_id: '', device_code: '' };
let devB = { device_id: '', device_code: '' };
let keyA = '';
const keyB = `chave-live-b-${run}`;
const query = (token: string, org: string, body: Record<string, unknown>) => callFunction('query-seals', { organization_id: org, ...body }, token);

async function realtimeClient(access: string, refresh: string): Promise<SupabaseClient> {
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.auth.setSession({ access_token: access, refresh_token: refresh });
  await client.realtime.setAuth(access);
  return client;
}

function listen(client: SupabaseClient, topic: string): Promise<{ received: Record<string, unknown>[]; status: string; stop: () => void }> {
  return new Promise((resolve) => {
    const received: Record<string, unknown>[] = [];
    const channel = client.channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'seal' }, ({ payload }) => received.push(payload as Record<string, unknown>));
    let settled = false;
    const done = (status: string) => {
      if (settled) return;
      settled = true;
      resolve({ received, status, stop: () => { void client.removeChannel(channel); } });
    };
    channel.subscribe((status) => { if (status !== 'CLOSED') done(status); });
    setTimeout(() => done('TIMED_OUT'), 8_000);
  });
}

const until = async (check: () => boolean, ms: number) => {
  const start = Date.now();
  while (!check() && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 100));
  return check();
};

// O administrador B da semente não tem papel no próprio tenant; a suíte lhe dá o papel de auditor do B (que pode ser retirado) e o
// retira no fim, para o B ter `seal.read` e o teste provar o "não encontrado" (e não só a falta de permissão).
const GRANT_B = `insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '${ORG_B}' and r.code = 'tenant_auditor' on conflict do nothing returning 'granted';`;
let grantedB = false;

describe('Lacre: posição do lacre até a tela (Spec 012, US1)', () => {
  beforeAll(async () => {
    loadSealFixtures();
    grantedB = sql(GRANT_B).includes('granted');
    await endAllSessions(USERS.tenantAAdmin);
    await endAllSessions(USERS.tenantBAdmin);
    const [a, b] = [await login(USERS.tenantAAdmin), await login(USERS.tenantBAdmin)];
    expect([a.status, b.status]).toEqual([200, 200]);
    tokenA = a.body.session.access_token as string;
    refreshA = a.body.session.refresh_token as string;
    tokenB = b.body.session.access_token as string;
    refreshB = b.body.session.refresh_token as string;
    cylA = createTestCylinder(ORG_A, `LIVE-A-${run}`);
    const cylB = createTestCylinder(ORG_B, `LIVE-B-${run}`);
    // Spec 013 (RF-018): o cadastro manual saiu da borda; o lacre do Tenant A nasce pelo apoio de SQL e o vínculo segue pela função real.
    keyA = `chave-live-a-${run}`;
    devA = createTestDevice(ORG_A, keyA, '10000000-0000-0000-0000-000000000002');
    const bound = await callFunction('manage-seals', { operation: 'bind_seal', organization_id: ORG_A, request_id: crypto.randomUUID(), device_id: devA.device_id, cylinder_id: cylA }, tokenA);
    expect(bound.body.code).toBe('BOUND');
    devB = createTestDevice(ORG_B, keyB, ADMIN_B);
    bindTestDevice(devB.device_id, cylB, ADMIN_B);
  }, 60_000);

  afterAll(async () => {
    for (const token of [tokenA, tokenB]) if (token) await logout(token);
    if (grantedB) sql(`delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-00000000000b'
      and role_id = (select id from public.roles where organization_id = '${ORG_B}' and code = 'tenant_auditor');`);
  });

  it('cada posição é guardada uma vez, na organização certa, com reenvio e lote (MS-001, MS-002)', async () => {
    const simA = new SealSimulator({ url: supabaseUrl, deviceCode: devA.device_code, key: keyA });
    const simB = new SealSimulator({ url: supabaseUrl, deviceCode: devB.device_code, key: keyB });
    const start = Date.now() - 30 * 60_000;
    for (let i = 0; i < 20; i += 1) simA.position({ latitude: -7.2 + (i % 2) * 0.00005, longitude: -39.3 }, new Date(start + i * 60_000).toISOString());
    const sent = await simA.send();
    expect(sent.status).toBe(200);
    // Reenvio da mesma mensagem (o lacre não recebeu a resposta).
    const first = (sent.body.results as { message_id: string }[])[0]!.message_id;
    const again = await simA.sendRaw({ protocol: 1, messages: [{ message_id: first, type: 'position', read_at: new Date(start).toISOString(),
      latitude: -7.2, longitude: -39.3, quality: 'gps', accuracy_m: 5, battery_pct: 87, signal_dbm: -61, seal_state: 'closed' }] });
    expect((again.body.results as { status: string }[])[0]!.status).toBe('duplicate');
    simB.position({ latitude: -8.05, longitude: -34.9 });
    expect((await simB.send()).status).toBe(200);

    expect(sql(`select count(*) from public.seal_positions where device_id = '${devA.device_id}'`)).toBe('1');
    expect(sql(`select count(distinct organization_id) || ':' || min(organization_id::text) from public.seal_positions where device_id = '${devA.device_id}'`)).toBe(`1:${ORG_A}`);
    const view = await query(tokenA, ORG_A, { operation: 'cylinder_seal_view', cylinder_id: cylA });
    expect(view.status).toBe(200);
    expect(view.body.seal.position.latitude).toBeCloseTo(-7.2, 3);
  }, 60_000);

  it('o Tenant B não vê nada do A, nem pelo identificador', async () => {
    expect((await query(tokenB, ORG_B, { operation: 'cylinder_seal_view', cylinder_id: cylA })).status).toBe(404);
    expect((await query(tokenB, ORG_B, { operation: 'get_seal', device_id: devA.device_id })).status).toBe(404);
    expect((await query(tokenB, ORG_A, { operation: 'list_seals' })).status).toBe(403);
    const listB = await query(tokenB, ORG_B, { operation: 'list_seals' });
    expect((listB.body.items as { device_id: string }[]).some((item) => item.device_id === devA.device_id)).toBe(false);
  });

  it('o aviso em tempo real chega ao tenant A e não ao B; posição na tela em até 10 s e resposta ao lacre em até 3 s', async () => {
    const clientA = await realtimeClient(tokenA, refreshA);
    const clientB = await realtimeClient(tokenB, refreshB);
    const a = await listen(clientA, `seals:${ORG_A}`);
    const b = await listen(clientB, `seals:${ORG_A}`);
    expect(a.status).toBe('SUBSCRIBED');

    const sim = new SealSimulator({ url: supabaseUrl, deviceCode: devA.device_code, key: keyA });
    sim.position({ latitude: -7.25, longitude: -39.3 });
    const sentAt = Date.now();
    const response = await sim.send();
    const gatewayMs = Date.now() - sentAt;
    expect(response.status).toBe(200);
    expect(gatewayMs).toBeLessThan(3_000);

    expect(await until(() => a.received.length > 0, 10_000)).toBe(true);
    const view = await query(tokenA, ORG_A, { operation: 'cylinder_seal_view', cylinder_id: cylA });
    expect(view.body.seal.position.latitude).toBeCloseTo(-7.25, 3);
    expect(Date.now() - sentAt).toBeLessThan(10_000);
    expect(a.received[0]).toMatchObject({ kind: 'position', device_id: devA.device_id, cylinder_id: cylA });
    expect(JSON.stringify(a.received)).not.toMatch(/latitude|longitude/);

    await new Promise((r) => setTimeout(r, 1_500));
    expect(b.received).toHaveLength(0);
    a.stop();
    b.stop();
  }, 60_000);
});
