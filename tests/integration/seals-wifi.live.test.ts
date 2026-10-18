// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, supabaseUrl, USERS } from '../support/auth-harness';
import { sql } from '../support/seal-db';
import { SealSimulator } from '../support/seal-simulator';

// Spec 012, US7 (T101), contra o Supabase local real: o administrador manda uma rede ao lacre pelo FluxID; a senha fica no Vault só até
// o lacre responder e some em seguida, tanto no cenário `rede-ok` (a rede entra na lista) quanto no `rede-falha` (alerta médio com o
// motivo, a rede não entra). A senha nunca chega à auditoria (MS-010, RF-034c). Exige seal-gateway e manage-seals carregadas.
const ORG_A = '20000000-0000-0000-0000-00000000000a';
const run = Date.now().toString(36).toUpperCase();
const PASSWORD_OK = `senha-live-ok-${run}`;
const PASSWORD_FAIL = `senha-live-falha-${run}`;

let tokenA = '';
let tokenB = '';
let device = { id: '', code: '', key: '' };
const manage = (token: string, body: Record<string, unknown>) =>
  callFunction('manage-seals', { organization_id: ORG_A, request_id: crypto.randomUUID(), device_id: device.id, ...body }, token);
const secrets = () => Number(sql(`select count(*) from vault.secrets s join public.seal_commands c on c.wifi_secret_id = s.id where c.device_id = '${device.id}';`));
const saved = () => JSON.parse(sql(`select wifi_saved::text from public.seal_devices where id = '${device.id}';`)) as string[];

describe('Lacre: redes Wi-Fi configuradas pelo sistema (Spec 012, US7)', () => {
  beforeAll(async () => {
    await endAllSessions(USERS.tenantAAdmin);
    await endAllSessions(USERS.tenantBAdmin);
    const [a, b] = [await login(USERS.tenantAAdmin), await login(USERS.tenantBAdmin)];
    expect([a.status, b.status]).toEqual([200, 200]);
    tokenA = a.body.session.access_token as string;
    tokenB = b.body.session.access_token as string;
    const created = await callFunction('manage-seals', { operation: 'create_device', organization_id: ORG_A, request_id: crypto.randomUUID(), label: `Lacre Wi-Fi ${run}` }, tokenA);
    expect(created.status).toBe(200);
    device = { id: created.body.device_id as string, code: created.body.device_code as string, key: created.body.device_key as string };
  });

  afterAll(async () => {
    await logout(tokenA);
    await logout(tokenB);
  });

  it('outro tenant não manda rede ao lacre', async () => {
    const response = await manage(tokenB, { operation: 'wifi_add', ssid: `Intrusa-${run}`, password: 'senha-de-outro-tenant', open: false });
    expect(response.status).not.toBe(200);
    expect(Number(sql(`select count(*) from public.seal_commands where device_id = '${device.id}';`))).toBe(0);
  });

  it('rede-ok: a senha vai ao lacre, a rede entra na lista e a senha some do Vault', async () => {
    const ssid = `Deposito-${run}`;
    const response = await manage(tokenA, { operation: 'wifi_add', ssid, password: PASSWORD_OK, open: false });
    expect(response.status).toBe(200);
    expect(secrets()).toBe(1);

    const sim = new SealSimulator({ url: supabaseUrl, deviceCode: device.code, key: device.key });
    sim.activation({ latitude: -7.209194, longitude: -39.306367 });
    expect((await sim.send()).status).toBe(200);
    expect(sim.commands.at(-1)).toMatchObject({ kind: 'wifi_add', ssid, password: PASSWORD_OK });
    expect((await sim.send()).status).toBe(200);

    expect(saved()).toContain(ssid);
    expect(secrets()).toBe(0);
    expect(sql(`select status from public.seal_commands where device_id = '${device.id}' and wifi_ssid = '${ssid}';`)).toBe('confirmed');
  });

  it('rede-falha: alerta médio com o motivo, a rede não entra e a senha também some', async () => {
    const ssid = `Cliente-${run}`;
    expect((await manage(tokenA, { operation: 'wifi_add', ssid, password: PASSWORD_FAIL, open: false })).status).toBe(200);
    expect(secrets()).toBe(1);

    const sim = new SealSimulator({
      url: supabaseUrl, deviceCode: device.code, key: device.key,
      onCommand: (command) => (command.kind.startsWith('wifi_') ? { result: 'error', reason: 'wifi_auth' } : { result: 'executed' }),
    });
    sim.event('boot');
    expect((await sim.send()).status).toBe(200);
    expect((await sim.send()).status).toBe(200);

    expect(saved()).not.toContain(ssid);
    expect(secrets()).toBe(0);
    expect(sql(`select severity || ':' || (context->>'reason') from public.seal_alerts where device_id = '${device.id}' and kind = 'wifi_change_failed';`)).toBe('medium:wifi_auth');
  });

  it('a auditoria guarda o nome da rede e nunca a senha', () => {
    const audit = sql(`select coalesce(string_agg(metadata::text, ' '), '') from public.audit_logs where target_id = '${device.id}' and action like 'seal.wifi%';`);
    expect(audit).toContain(`Deposito-${run}`);
    expect(audit).not.toContain(PASSWORD_OK);
    expect(audit).not.toContain(PASSWORD_FAIL);
    expect(sql(`select count(*) from public.seal_commands where device_id = '${device.id}' and wifi_secret_id is not null;`)).toBe('0');
  });
});
