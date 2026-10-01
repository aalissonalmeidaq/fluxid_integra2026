// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { endAllSessions, login, logout, publishableKey, sessionStatus, supabaseUrl, USERS } from '../support/auth-harness';
import { totp } from '../support/totp';

// TOTP e AAL2 (RF-034, RS-014) com o Auth local. O usuário global sintético remove o fator ao final.
const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as Record<string, string>;

describe('MFA TOTP e AAL2', () => {
  let client: SupabaseClient;
  let factorId: string | undefined;
  let accessToken = '';

  beforeEach(async () => {
    await endAllSessions(USERS.mfaGlobal);
    const result = await login(USERS.mfaGlobal);
    expect(result.body.code).toBe('MFA_REQUIRED');
    client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await client.auth.setSession({ access_token: result.body.session.access_token, refresh_token: result.body.session.refresh_token });
    accessToken = result.body.session.access_token;
  });

  afterEach(async () => {
    if (factorId) await client.auth.mfa.unenroll({ factorId });
    factorId = undefined;
    const current = (await client.auth.getSession()).data.session?.access_token ?? accessToken;
    await logout(current);
    await endAllSessions(USERS.mfaGlobal);
  });

  it('perfil global entra em AAL1 e a sessão limitada ao fluxo MFA é reconhecida', async () => {
    expect(claims(accessToken).aal).toBe('aal1');
    const status = await sessionStatus(accessToken);
    expect(status.body).toMatchObject({ code: 'SESSION_ACTIVE', aal: 'aal1', mfa_required: true });
  });

  it('matricula TOTP com QR e alternativa textual acessível', async () => {
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Suíte de contrato' });
    expect(error).toBeNull();
    factorId = data!.id;
    expect(data!.totp.qr_code).toBeTruthy();
    expect(data!.totp.secret).toMatch(/^[A-Z2-7]+$/);
  });

  it('código correto eleva a sessão a AAL2 e o status confiável reflete o nível', async () => {
    const { data: enrolled } = await client.auth.mfa.enroll({ factorType: 'totp' });
    factorId = enrolled!.id;

    const challenge = await client.auth.mfa.challenge({ factorId });
    const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data!.id, code: totp(enrolled!.totp.secret) });
    expect(verified.error).toBeNull();

    const upgraded = verified.data!.access_token;
    expect(claims(upgraded).aal).toBe('aal2');
    expect(claims(upgraded).session_id).toBe(claims(accessToken).session_id);
    expect((await sessionStatus(upgraded)).body).toMatchObject({ code: 'SESSION_ACTIVE', aal: 'aal2', mfa_required: false });
  });

  it('código incorreto não eleva o nível nem revela detalhes', async () => {
    const { data: enrolled } = await client.auth.mfa.enroll({ factorType: 'totp' });
    factorId = enrolled!.id;

    const challenge = await client.auth.mfa.challenge({ factorId });
    const wrong = totp(enrolled!.totp.secret) === '000000' ? '111111' : '000000';
    const verified = await client.auth.mfa.verify({ factorId, challengeId: challenge.data!.id, code: wrong });

    expect(verified.error).not.toBeNull();
    expect(verified.data).toBeNull();
    expect(JSON.stringify(verified.error)).not.toContain(enrolled!.totp.secret);
    const status = await sessionStatus(accessToken);
    expect(status.body.aal).toBe('aal1');
  });
});
