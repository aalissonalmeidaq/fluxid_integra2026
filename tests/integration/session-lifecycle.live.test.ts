// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { endAllSessions, login, logout, publishableKey, restGet, sessionStatus, supabaseUrl, USERS } from '../support/auth-harness';

// Ciclo de vida da sessão (RF-002–RF-004, RF-035, RF-037, RS-012) com o Supabase local.
// Timebox de 8 horas e inatividade de 30 minutos exigem manipular o relógio e são provados em
// supabase/tests/002_session_governance.test.sql; aqui valem renovação, revogação e efeito na Data API.
const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as Record<string, number | string>;

describe('Ciclo de vida da sessão', () => {
  beforeEach(() => endAllSessions(USERS.life));
  afterEach(() => endAllSessions(USERS.life));

  it('emite JWT de 1 hora e sessão limitada a 8 horas', async () => {
    const result = await login(USERS.life);
    const { exp, iat } = claims(result.body.session.access_token) as { exp: number; iat: number };
    expect(exp - iat).toBe(3600);

    const status = await sessionStatus(result.body.session.access_token);
    const remainingMs = new Date(status.body.expires_at).getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(7.9 * 3600_000);
    expect(remainingMs).toBeLessThanOrEqual(8 * 3600_000);
  });

  it('renova a sessão sem ampliar permissões nem trocar a sessão de governança', async () => {
    const result = await login(USERS.life);
    const before = claims(result.body.session.access_token);

    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const refreshed = await client.auth.setSession({
      access_token: result.body.session.access_token,
      refresh_token: result.body.session.refresh_token,
    });
    const renewed = await client.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(renewed.error).toBeNull();

    const after = claims(renewed.data.session!.access_token);
    expect(after.session_id).toBe(before.session_id);
    expect(after.sub).toBe(before.sub);
    expect(after.role).toBe('authenticated');
    expect((await sessionStatus(renewed.data.session!.access_token)).body.code).toBe('SESSION_ACTIVE');
  });

  it('impede renovar depois do logout', async () => {
    const result = await login(USERS.life);
    await logout(result.body.session.access_token);

    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await client.auth.setSession({ access_token: result.body.session.access_token, refresh_token: result.body.session.refresh_token });
    const renewed = await client.auth.refreshSession();
    expect(renewed.data.session).toBeNull();
    expect(renewed.error).not.toBeNull();
  });

  it('revogação vale imediatamente para a Data API, mesmo com o JWT ainda vigente', async () => {
    const result = await login(USERS.life);
    const token = result.body.session.access_token;

    const before = await restGet('organizations?select=id', token);
    expect(before.status).toBe(200);
    expect((before.body as unknown[]).length).toBe(1);

    await logout(token);

    const after = await restGet('organizations?select=id', token);
    expect(after.body).toEqual([]);
    expect((await restGet('profiles?select=user_id', token)).body).toEqual([]);
  });

  it('isola o tenant: usuário do Tenant A não recebe dados do Tenant B pela Data API', async () => {
    const result = await login(USERS.life);
    const token = result.body.session.access_token;

    const organizations = (await restGet('organizations?select=id,display_name', token)).body as Array<{ display_name: string }>;
    expect(organizations.map((organization) => organization.display_name)).toEqual(['Tenant A']);
    const foreign = await restGet('organizations?id=eq.20000000-0000-0000-0000-00000000000b&select=id', token);
    expect(foreign.body).toEqual([]);
  });

  it('nega token ausente ou inválido na Data API e no status de sessão', async () => {
    expect((await sessionStatus()).status).toBe(401);
    expect((await sessionStatus('token.invalido.aqui')).status).toBe(401);
    const anonymous = await restGet('organizations?select=id', publishableKey);
    expect(anonymous.status).toBeGreaterThanOrEqual(400);
  });
});
