// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, supabaseUrl, USERS } from '../support/auth-harness';
import { sql } from '../support/seal-db';
import { SealSimulator } from '../support/seal-simulator';

// Spec 013, US2 (T022), contra o Supabase local real: um lacre novo pede aprovação, o Master aprova para o Tenant A pela platform-seals,
// o lacre passa a receber 200 e a posição fica no A; o B não vê nada (MS-002, MS-003, MS-004). Conflito resolvido e recusa com 403.
// Exige as funções seal-gateway, platform-seals e query-seals carregadas (supabase stop/start). O fator TOTP do Master é removido no fim.
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ORG_B = '20000000-0000-0000-0000-00000000000b';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const code = () => `DSP-${Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;
const run = Date.now().toString(36);

let master = '';
let tokenA = '';
let tokenB = '';
let grantedB = false;

const platform = (body: Record<string, unknown>) => callFunction('platform-seals', body, master);
const pendingItem = async (deviceCode: string, status = 'pending') => {
  const listed = await platform({ operation: 'list_enrollments', status, offset: 0, limit: 100 });
  expect(listed.status).toBe(200);
  return (listed.body.items as { id: string; device_code: string; updated_at: string; conflict: boolean }[]).find((i) => i.device_code === deviceCode);
};
const until = async <T>(check: () => Promise<T | undefined>, ms: number): Promise<T | undefined> => {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value !== undefined || Date.now() - start > ms) return value;
    await new Promise((r) => setTimeout(r, 500));
  }
};
const tenantSees = async (token: string, org: string, deviceCode: string) => {
  const listed = await callFunction('query-seals', { operation: 'list_seals', organization_id: org, offset: 0, limit: 200 }, token);
  return (listed.body.items as { device_code: string }[] | undefined)?.some((i) => i.device_code === deviceCode) ? true : undefined;
};

const GRANT_B = `insert into public.membership_roles (membership_id, role_id, assigned_by)
  select '30000000-0000-0000-0000-00000000000b', r.id, '10000000-0000-0000-0000-000000000001' from public.roles r
   where r.organization_id = '${ORG_B}' and r.code = 'tenant_auditor' on conflict do nothing returning 'granted';`;

describe('Lacre novo: pedido, aprovação pelo Master e destinação (Spec 013, US2)', () => {
  beforeAll(async () => {
    grantedB = sql(GRANT_B).includes('granted');
    for (const user of [USERS.master, USERS.tenantAAdmin, USERS.tenantBAdmin]) await endAllSessions(user);
    const result = await login(USERS.master);
    // Spec 013 (RF-021): o Master entra só com e-mail e senha.
    master = result.body.session.access_token as string;
    const [a, b] = [await login(USERS.tenantAAdmin), await login(USERS.tenantBAdmin)];
    expect([a.status, b.status]).toEqual([200, 200]);
    tokenA = a.body.session.access_token as string;
    tokenB = b.body.session.access_token as string;
  }, 60_000);

  afterAll(async () => {
    for (const token of [master, tokenA, tokenB]) if (token) await logout(token);
    await endAllSessions(USERS.master);
    if (grantedB) sql(`delete from public.membership_roles where membership_id = '30000000-0000-0000-0000-00000000000b'
      and role_id = (select id from public.roles where organization_id = '${ORG_B}' and code = 'tenant_auditor');`);
  });

  it('o pedido aparece ao Master, a aprovação destina ao A e o B não vê nada (MS-002, MS-003, MS-004)', async () => {
    const deviceCode = code();
    const sim = new SealSimulator({ url: supabaseUrl, deviceCode, key: `fxk_live-${run}-a` });
    const asked = Date.now();
    expect((await sim.requestApproval()).status).toBe(202);
    const item = await until(() => pendingItem(deviceCode), 60_000);
    expect(item, 'o pedido aparece em Aguardando').toBeDefined();
    expect(Date.now() - asked).toBeLessThan(60_000);
    expect(sql(`select count(*) from public.seal_messages m join public.seal_devices d on d.id = m.device_id where d.device_code = '${deviceCode}'`)).toBe('0');

    const approved = await platform({ operation: 'approve_enrollment', request_id: crypto.randomUUID(), enrollment_id: item!.id, organization_id: ORG_A,
      justification: 'Lacre conferido na suíte', expected_updated_at: item!.updated_at });
    expect(approved.body.code).toBe('APPROVED');
    const decided = Date.now();
    expect(await until(() => tenantSees(tokenA, ORG_A, deviceCode), 60_000), 'o A vê o lacre').toBe(true);
    expect(Date.now() - decided).toBeLessThan(60_000);

    expect((await sim.requestApproval()).status).toBe(200);
    sim.position({ latitude: -7.2, longitude: -39.3 });
    expect((await sim.send()).status).toBe(200);
    expect(sql(`select count(*) from public.seal_positions p join public.seal_devices d on d.id = p.device_id
      where d.device_code = '${deviceCode}' and p.organization_id = '${ORG_A}'`)).toBe('1');
    expect(await tenantSees(tokenB, ORG_B, deviceCode)).toBeUndefined();
  }, 120_000);

  it('outro aparelho com o mesmo código: 401 e conflito; o Master mantém a chave atual', async () => {
    const deviceCode = code();
    const right = new SealSimulator({ url: supabaseUrl, deviceCode, key: `fxk_live-${run}-certa` });
    const intruder = new SealSimulator({ url: supabaseUrl, deviceCode, key: `fxk_live-${run}-intrusa` });
    expect((await right.requestApproval()).status).toBe(202);
    expect((await intruder.requestApproval()).status).toBe(401);
    const item = await pendingItem(deviceCode);
    expect(item?.conflict).toBe(true);
    const resolved = await platform({ operation: 'replace_enrollment_key', request_id: crypto.randomUUID(), enrollment_id: item!.id, keep_current: true,
      justification: 'Aparelho desconhecido na rede', expected_updated_at: item!.updated_at });
    expect(resolved.body.code).toBe('CONFLICT_CLEARED');
    expect((await pendingItem(deviceCode))?.conflict).toBe(false);
    expect((await right.requestApproval()).status).toBe(202);
  });

  it('recusado: o lacre recebe 403 e o pedido sai de Aguardando', async () => {
    const deviceCode = code();
    const sim = new SealSimulator({ url: supabaseUrl, deviceCode, key: `fxk_live-${run}-recusa` });
    expect((await sim.requestApproval()).status).toBe(202);
    const item = await pendingItem(deviceCode);
    const refused = await platform({ operation: 'refuse_enrollment', request_id: crypto.randomUUID(), enrollment_id: item!.id,
      justification: 'Lacre desconhecido', expected_updated_at: item!.updated_at });
    expect(refused.body.code).toBe('REFUSED');
    expect((await sim.requestApproval()).status).toBe(403);
    expect(sim.approval).toBe('refused');
    expect(await pendingItem(deviceCode)).toBeUndefined();
  });

  it('sem o segundo fator, a platform-seals nega e audita', async () => {
    const response = await callFunction('platform-seals', { operation: 'list_enrollments', offset: 0, limit: 10 }, tokenA);
    expect(response.status).toBe(403);
    expect(['MFA_REQUIRED', 'ACCESS_DENIED']).toContain(response.body.code);
  });
});
