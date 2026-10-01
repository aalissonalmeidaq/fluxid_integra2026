// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { endAllSessions, login, logout, publishableKey, supabaseUrl, USERS } from '../support/auth-harness';
import { totp } from '../support/totp';

// Consulta de auditoria com Edge Function, RPC e RLS reais (RF-038, AUD-004, AUD-007, ISO-006).
const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const TENANT_B = '20000000-0000-0000-0000-00000000000b';

interface AuditEvent { id: number; organization_id: string | null; action: string; result: string; actor: { id: string | null; display_name: string | null }; metadata: Record<string, unknown>; origin: string }
interface Page { events: AuditEvent[]; next: { occurred_at: string; id: number } | null }

async function query(token: string | null, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/query-audit`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as { code: string } & Partial<Page> };
}

async function access(token: string, body: Record<string, unknown>) {
  const response = await fetch(`${supabaseUrl}/functions/v1/manage-access`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as { code: string; role: { id: string } } };
}

describe('Consulta de auditoria ao vivo', () => {
  let adminA = '';
  let adminB = '';
  let client: SupabaseClient;
  let factorId: string | undefined;
  let roleId = '';

  beforeAll(async () => {
    for (const user of [USERS.tenantAAdmin, USERS.auditB]) await endAllSessions(user);
    const [a, b] = await Promise.all([login(USERS.tenantAAdmin), login(USERS.auditB)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    adminB = b.body.session.access_token;

    // Eventos reais: o administrador A eleva a sessão a AAL2 e cria um papel pela fronteira de gestão de acesso.
    client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await client.auth.setSession({ access_token: a.body.session.access_token, refresh_token: a.body.session.refresh_token });
    const enrolled = await client.auth.mfa.enroll({ factorType: 'totp' });
    factorId = enrolled.data!.id;
    const challenge = await client.auth.mfa.challenge({ factorId });
    const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data!.id, code: totp(enrolled.data!.totp.secret) });
    expect(verified.error).toBeNull();
    adminA = verified.data!.access_token;

    const created = await access(adminA, { operation: 'save_role', organization_id: TENANT_A, name: `Auditoria ao vivo ${Date.now()}`, description: 'Criado pela suíte ao vivo', permissions: ['audit.read'], justification: 'Evidência para a consulta de auditoria' });
    expect(created.status).toBe(201);
    roleId = created.body.role.id;
  });

  afterAll(async () => {
    if (roleId) await access(adminA, { operation: 'set_role_active', organization_id: TENANT_A, role_id: roleId, active: false, expected_version: 1, justification: 'Limpeza da suíte ao vivo' });
    if (factorId) await client.auth.mfa.unenroll({ factorId });
    const current = (await client.auth.getSession()).data.session?.access_token ?? adminA;
    for (const token of [current, adminB]) await logout(token);
    for (const user of [USERS.tenantAAdmin, USERS.auditB]) await endAllSessions(user);
  });

  it('exige sessão autenticada e entrada válida', async () => {
    expect((await query(null, { scope: 'tenant', organization_id: TENANT_A })).status).toBe(401);
    expect(await query(adminA, { scope: 'tenant' })).toMatchObject({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    expect(await query(adminA, { scope: 'tenant', organization_id: TENANT_A, result: 'quebrado' })).toMatchObject({ status: 400 });
  });

  it('o administrador do tenant lista somente eventos do próprio tenant, sanitizados e ordenados', async () => {
    const result = await query(adminA, { scope: 'tenant', organization_id: TENANT_A, limit: 100 });
    expect(result.status).toBe(200);
    const events = result.body.events!;
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.organization_id === TENANT_A)).toBe(true);
    expect(events.every((event) => typeof event.origin === 'string')).toBe(true);
    const created = events.find((event) => event.action === 'role.create' && event.result === 'success');
    expect(created).toBeDefined();
    expect(created!.actor.display_name).toBe('Administrador A');
    expect(created!.metadata.permissions).toEqual(['audit.read']);
    expect(JSON.stringify(events)).not.toMatch(/password|refresh_token|secret|access_token/i);
    const ids = events.map((event) => event.id);
    expect(ids).toEqual([...ids].sort((x, y) => y - x));
  });

  it('pagina por cursor sem repetir nem pular eventos', async () => {
    const all = (await query(adminA, { scope: 'tenant', organization_id: TENANT_A, limit: 100 })).body.events!;
    const seen: number[] = [];
    let cursor: Page['next'] = null;
    for (let page = 0; page < 200; page += 1) {
      const result = await query(adminA, { scope: 'tenant', organization_id: TENANT_A, limit: 2, ...(cursor ? { before: cursor } : {}) });
      expect(result.status).toBe(200);
      seen.push(...result.body.events!.map((event) => event.id));
      cursor = result.body.next ?? null;
      if (!cursor || seen.length >= all.length) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.slice(0, all.length)).toEqual(all.map((event) => event.id).slice(0, seen.length));
  });

  it('filtra por resultado e por ação dentro do escopo', async () => {
    const success = await query(adminA, { scope: 'tenant', organization_id: TENANT_A, result: 'success', limit: 100 });
    expect(success.body.events!.every((event) => event.result === 'success')).toBe(true);
    const none = await query(adminA, { scope: 'tenant', organization_id: TENANT_A, action: 'acao.inexistente', limit: 10 });
    expect(none.body.events).toEqual([]);
  });

  it('nega o tenant alheio e a consulta global, sem revelar nada', async () => {
    const foreign = await query(adminA, { scope: 'tenant', organization_id: TENANT_B });
    expect(foreign).toMatchObject({ status: 403, body: { code: 'ACCESS_DENIED' } });
    expect(foreign.body.events).toBeUndefined();
    // O tenant B do seed não tem administrador com `audit.read`: a negação também vale para o próprio tenant.
    expect(await query(adminB, { scope: 'tenant', organization_id: TENANT_B })).toMatchObject({ status: 403, body: { code: 'ACCESS_DENIED' } });
    expect(await query(adminB, { scope: 'tenant', organization_id: TENANT_A })).toMatchObject({ status: 403 });
    // Sem AAL2 a consulta global nem chega à verificação de permissão; com AAL2 um administrador de tenant continua negado.
    expect(await query(adminB, { scope: 'global' })).toMatchObject({ status: 403, body: { code: 'MFA_REQUIRED' } });
    expect(await query(adminA, { scope: 'global' })).toMatchObject({ status: 403, body: { code: 'ACCESS_DENIED' } });
  });

  it('a aplicação não consegue alterar nem excluir a trilha pela Data API', async () => {
    const headers = { apikey: publishableKey, authorization: `Bearer ${adminA}`, 'content-type': 'application/json', prefer: 'return=representation' };
    const update = await fetch(`${supabaseUrl}/rest/v1/audit_logs?organization_id=eq.${TENANT_A}`, { method: 'PATCH', headers, body: JSON.stringify({ result: 'success' }) });
    expect(update.status).toBeGreaterThanOrEqual(400);
    const remove = await fetch(`${supabaseUrl}/rest/v1/audit_logs?organization_id=eq.${TENANT_A}`, { method: 'DELETE', headers });
    expect(remove.status).toBeGreaterThanOrEqual(400);
    const insert = await fetch(`${supabaseUrl}/rest/v1/audit_logs`, { method: 'POST', headers, body: JSON.stringify({ action: 'x', target_type: 'y', result: 'success' }) });
    expect(insert.status).toBeGreaterThanOrEqual(400);
  });
});
