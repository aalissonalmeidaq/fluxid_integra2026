// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { visibleScreens, type ActorPermissions } from '../../src/domain/navigation/visible-screens';
import { callFunction, endAllSessions, login, logout, publishableKey, supabaseUrl, USERS } from '../support/auth-harness';
import { totp } from '../support/totp';

// Consulta das próprias permissões e paridade menu × servidor, com Edge Function, RPC e RLS reais (Spec 004).
// Usa os tenants C e D e usuários próprios do seed (nav-*), para não disputar sessões nem contagens com outras suítes.
const TENANT_C = '20000000-0000-0000-0000-00000000000c';
const TENANT_D = '20000000-0000-0000-0000-00000000000d';
const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const OPERATOR_MEMBERSHIP_C = '30000000-0000-0000-0000-000000000015';
const JUSTIFICATION = 'Evidência da suíte ao vivo de permissões';

interface PermissionsBody { code: string; tenant: string[]; global: string[] }
interface AuditEvent { id: number; action: string; result: string }

async function permissions(token: string | null, body: Record<string, unknown> = {}, method = 'POST') {
  const response = await fetch(`${supabaseUrl}/functions/v1/query-permissions`, {
    method,
    headers: { apikey: publishableKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => null) as PermissionsBody | null };
}

const actor = (response: Awaited<ReturnType<typeof permissions>>): ActorPermissions => ({ tenant: response.body?.tenant ?? [], global: response.body?.global ?? [] });
const labels = (value: ActorPermissions) => visibleScreens(value).map((screen) => screen.label);

describe('Consulta de permissões e paridade do menu ao vivo', () => {
  let admin = '';
  let operator = '';
  let fluxid = '';
  const elevated: Array<{ client: SupabaseClient; factorId: string }> = [];
  let roleId = '';

  const access = async (body: Record<string, unknown>) => (await callFunction('manage-access', body, admin));
  const auditEvents = async (token: string, organizationId: string) => {
    const result = await callFunction('query-audit', { scope: 'tenant', organization_id: organizationId, limit: 100 }, token);
    return { status: result.status, events: (result.body.events ?? []) as AuditEvent[] };
  };

  // Todas as sessões sobem a AAL2: assim o servidor sempre decide pela permissão (e não pelo pedido de segundo fator) ao abrir
  // cada tela, e a paridade com o menu fica exata. A consulta de permissões em si não depende de AAL.
  async function elevate(session: { access_token: string; refresh_token: string }): Promise<string> {
    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
    const factorId = enrolled.data!.id;
    const challenge = await client.auth.mfa.challenge({ factorId });
    const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data!.id, code: totp(enrolled.data!.totp.secret) });
    expect(verified.error).toBeNull();
    elevated.push({ client, factorId });
    return verified.data!.access_token;
  }

  beforeAll(async () => {
    for (const user of [USERS.navAdmin, USERS.navOperator, USERS.navFluxid]) await endAllSessions(user);
    const [a, o, f] = await Promise.all([login(USERS.navAdmin), login(USERS.navOperator), login(USERS.navFluxid)]);
    expect([a.status, o.status, f.status]).toEqual([200, 200, 200]);
    [admin, operator, fluxid] = await Promise.all([elevate(a.body.session), elevate(o.body.session), elevate(f.body.session)]);
  });

  afterAll(async () => {
    if (roleId) {
      await access({ operation: 'remove_role', organization_id: TENANT_C, membership_id: OPERATOR_MEMBERSHIP_C, role_id: roleId, justification: JUSTIFICATION });
      await access({ operation: 'set_role_active', organization_id: TENANT_C, role_id: roleId, active: false, expected_version: 1, justification: 'Limpeza da suíte ao vivo' });
    }
    const tokens: string[] = [];
    for (const { client, factorId } of elevated) {
      tokens.push((await client.auth.getSession()).data.session?.access_token ?? '');
      await client.auth.mfa.unenroll({ factorId });
    }
    for (const token of tokens.filter(Boolean)) await logout(token);
    for (const user of [USERS.navAdmin, USERS.navOperator, USERS.navFluxid]) await endAllSessions(user);
  });

  it('exige sessão, aceita só POST e valida o identificador da organização', async () => {
    expect((await permissions(null)).status).toBe(401);
    expect((await permissions('token-invalido')).status).toBe(401);
    expect((await permissions(admin, {}, 'GET')).status).toBe(405);
    expect(await permissions(admin, { organization_id: 'nao-e-uuid' })).toMatchObject({ status: 400, body: { code: 'VALIDATION_FAILED' } });
  });

  it('devolve somente code, tenant e global, com os códigos do administrador do Tenant C', async () => {
    const result = await permissions(admin, { organization_id: TENANT_C });
    expect(result.status).toBe(200);
    expect(Object.keys(result.body!).sort()).toEqual(['code', 'global', 'tenant']);
    expect(result.body).toEqual({ code: 'PERMISSIONS_LISTED', tenant: ['audit.read', 'tenant.manage'], global: [] });
    expect(labels(actor(result))).toEqual(['Visão geral', 'Meu perfil', 'Pessoas do tenant', 'Papéis e permissões', 'Auditoria do tenant']);
  });

  it('o operador técnico recebe só as permissões do papel e o menu básico', async () => {
    const result = await permissions(operator, { organization_id: TENANT_C });
    expect(result.body).toEqual({ code: 'PERMISSIONS_LISTED', tenant: [], global: [] });
    expect(labels(actor(result))).toEqual(['Visão geral', 'Meu perfil']);
  });

  it('o Administrador FluxID recebe permissões globais e nenhuma do tenant, com ou sem tenant ativo', async () => {
    for (const body of [{}, { organization_id: TENANT_C }]) {
      const result = await permissions(fluxid, body);
      expect(result.body).toEqual({ code: 'PERMISSIONS_LISTED', tenant: [], global: ['audit.read', 'platform.manage', 'profile.read'] });
      expect(labels(actor(result))).toEqual(['Visão geral', 'Meu perfil', 'Organizações', 'Auditoria da plataforma']);
    }
  });

  it('com dois tenants a mesma sessão recebe conjuntos distintos por organização (CA-002)', async () => {
    const inC = await permissions(admin, { organization_id: TENANT_C });
    const inD = await permissions(admin, { organization_id: TENANT_D });
    expect(inC.body?.tenant).toEqual(['audit.read', 'tenant.manage']);
    expect(inD.body?.tenant).toEqual([]);
    expect(labels(actor(inD))).toEqual(['Visão geral', 'Meu perfil']);
  });

  it('um tenant sem vínculo ativo devolve listas vazias, sem código nem identificador do outro tenant', async () => {
    for (const [token, organization] of [[operator, TENANT_D], [admin, TENANT_A], [fluxid, TENANT_A]] as const) {
      const result = await permissions(token, { organization_id: organization });
      expect(result.status).toBe(200);
      expect(result.body?.tenant).toEqual([]);
      expect(JSON.stringify(result.body)).not.toContain(organization);
    }
    // Organização inexistente é indistinguível de organização alheia.
    expect((await permissions(admin, { organization_id: '20000000-0000-0000-0000-0000000000ff' })).body).toEqual({ code: 'PERMISSIONS_LISTED', tenant: [], global: [] });
  });

  it('a leitura não cria evento de auditoria (RF-023)', async () => {
    const before = await auditEvents(admin, TENANT_C);
    expect(before.status).toBe(200);
    for (let index = 0; index < 3; index += 1) await permissions(admin, { organization_id: TENANT_C });
    await permissions(operator, { organization_id: TENANT_C });
    const after = await auditEvents(admin, TENANT_C);
    expect(after.events.map((event) => event.id)).toEqual(before.events.map((event) => event.id));
  });

  // Paridade (RF-008, CA-001): para cada perfil, a lista do menu bate com o que o servidor aceita ao abrir cada tela.
  // "Permitido" é o status 200; "negado" é 403 ACCESS_DENIED.
  const screenCalls: Array<{ label: string; call: (token: string, organization: string | null) => Promise<{ status: number; body: { code?: string } }> }> = [
    { label: 'Pessoas do tenant', call: (token, organization) => callFunction('manage-membership', { operation: 'list', organization_id: organization }, token) },
    { label: 'Papéis e permissões', call: (token, organization) => callFunction('manage-access', { operation: 'list', organization_id: organization }, token) },
    { label: 'Auditoria do tenant', call: (token, organization) => callFunction('query-audit', { scope: 'tenant', organization_id: organization }, token) },
    { label: 'Organizações', call: (token) => callFunction('manage-organizations', { operation: 'list' }, token) },
    { label: 'Auditoria da plataforma', call: (token) => callFunction('query-audit', { scope: 'global' }, token) },
  ];
  const allowed = (response: { status: number; body: { code?: string } }) => response.status === 200;

  const profiles = (): Array<[string, string, string | null]> => [
    ['administrador do Tenant C', admin, TENANT_C],
    ['administrador no Tenant D (operador)', admin, TENANT_D],
    ['operador técnico do Tenant C', operator, TENANT_C],
    ['Administrador FluxID com o Tenant C ativo', fluxid, TENANT_C],
    ['Administrador FluxID sem tenant ativo', fluxid, null],
  ];

  it.each([0, 1, 2, 3, 4])('menu e servidor concordam no perfil %#', async (index) => {
    const [name, token, organization] = profiles()[index]!;
    const result = await permissions(token, organization ? { organization_id: organization } : {});
    const shown = labels(actor(result));
    for (const { label, call } of screenCalls) {
      const response = await call(token, organization);
      expect(shown.includes(label), `${name}: "${label}" no menu = ${shown.includes(label)}, servidor aceitou = ${allowed(response)} (${response.status} ${response.body.code})`).toBe(allowed(response));
    }
  });

  it('as negativas de acesso continuam sendo auditadas pelas funções da Spec 002', async () => {
    const denied = await callFunction('manage-access', { operation: 'list', organization_id: TENANT_C }, operator);
    expect(denied).toMatchObject({ status: 403, body: { code: 'ACCESS_DENIED' } });
    // A negação por permissão é auditada sem tenant (para não confirmar a existência dele): aparece na trilha global.
    const trail = await callFunction('query-audit', { scope: 'global', limit: 100 }, fluxid);
    expect(trail.status).toBe(200);
    expect((trail.body.events as AuditEvent[]).some((event) => event.action === 'access.list' && event.result === 'denied')).toBe(true);
  });

  it('uma permissão ganha e depois retirada aparece na consulta seguinte, e o servidor recusa a tela imediatamente (RF-016, RF-021)', async () => {
    const created = await access({ operation: 'save_role', organization_id: TENANT_C, name: `Auditor de navegação ${Date.now()}`, description: 'Criado pela suíte ao vivo', permissions: ['audit.read'], justification: JUSTIFICATION });
    expect(created.status).toBe(201);
    roleId = created.body.role.id;
    const assign = { organization_id: TENANT_C, membership_id: OPERATOR_MEMBERSHIP_C, role_id: roleId, justification: JUSTIFICATION };

    expect((await access({ operation: 'assign_role', ...assign })).status).toBe(200);
    const gained = await permissions(operator, { organization_id: TENANT_C });
    expect(gained.body?.tenant).toContain('audit.read');
    expect(labels(actor(gained))).toContain('Auditoria do tenant');
    expect((await callFunction('query-audit', { scope: 'tenant', organization_id: TENANT_C }, operator)).status).toBe(200);

    // Retirada no meio: o menu antigo ainda mostraria a tela, mas o servidor já recusa.
    expect((await access({ operation: 'remove_role', ...assign })).status).toBe(200);
    expect(await callFunction('query-audit', { scope: 'tenant', organization_id: TENANT_C }, operator)).toMatchObject({ status: 403, body: { code: 'ACCESS_DENIED' } });
    const lost = await permissions(operator, { organization_id: TENANT_C });
    expect(lost.body?.tenant).not.toContain('audit.read');
    expect(labels(actor(lost))).not.toContain('Auditoria do tenant');
  });
});
