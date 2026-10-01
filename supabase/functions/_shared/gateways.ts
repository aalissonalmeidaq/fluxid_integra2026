import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decodeClaims } from './http.ts';
import type { AuthAuditEvent, LoginGateway, SessionSummary } from '../session-login/handler.ts';
import type { LogoutGateway } from '../session-logout/handler.ts';
import type { SessionValidation, StatusGateway } from '../session-status/handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(key: string): string | undefined } } }

function environment(name: string): string {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
}

const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function adminClient(): SupabaseClient {
  return createClient(environment('SUPABASE_URL'), environment('SUPABASE_SERVICE_ROLE_KEY'), OPTIONS);
}

function anonClient(): SupabaseClient {
  return createClient(environment('SUPABASE_URL'), environment('SUPABASE_ANON_KEY'), OPTIONS);
}

async function rpc<T>(admin: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error('rpc_failed');
  return data as T;
}

function auditRecorder(admin: SupabaseClient) {
  return async (event: { action: string; result: string; actorId?: string; sessionId?: string; reason?: string }) => {
    await rpc<number>(admin, 'record_auth_event', {
      p_actor: event.actorId ?? null,
      p_session: event.sessionId ?? null,
      p_action: event.action,
      p_result: event.result,
      p_reason: event.reason ?? null,
      p_organization: null,
    });
  };
}

async function authenticate(admin: SupabaseClient, accessToken: string) {
  // O Auth valida assinatura, expiração e a existência da sessão; só então as claims são lidas.
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) return null;
  const claims = decodeClaims(accessToken);
  if (!claims.session_id) return null;
  return { userId: data.user.id, sessionId: claims.session_id, aal: claims.aal === 'aal2' ? 'aal2' as const : 'aal1' as const };
}

export function createLoginGateway(): LoginGateway {
  const admin = adminClient();
  const anon = anonClient();
  return {
    isRateLimited: (keyHash) => rpc<boolean>(admin, 'is_login_rate_limited', { p_key_hash: keyHash }),
    registerFailure: async (keyHash) => { await rpc(admin, 'register_login_failure', { p_key_hash: keyHash }); },
    clearFailures: async (keyHash) => { await rpc(admin, 'clear_login_failures', { p_key_hash: keyHash }); },
    async signIn(email, password) {
      const { data, error } = await anon.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) return { ok: false };
      const claims = decodeClaims(data.session.access_token);
      if (!claims.session_id) return { ok: false };
      return {
        ok: true,
        userId: data.user.id,
        sessionId: claims.session_id,
        aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
          token_type: data.session.token_type,
        },
      };
    },
    async signOutSession(accessToken) { await admin.auth.admin.signOut(accessToken, 'local'); },
    async eligibility(userId) {
      const result = await rpc<{ eligible: boolean; requires_mfa: boolean }>(admin, 'login_eligibility', { p_user_id: userId });
      return { eligible: result.eligible, requiresMfa: result.requires_mfa };
    },
    endSession: (userId, sessionId, reason) =>
      rpc<boolean>(admin, 'end_user_session', { p_user_id: userId, p_session_id: sessionId, p_reason: reason }),
    async startSession(userId, sessionId, aal) {
      const result = await rpc<{ status: 'started' | 'ended' | 'limit_reached'; sessions?: SessionSummary[] }>(
        admin, 'start_user_session', { p_user_id: userId, p_session_id: sessionId, p_aal: aal });
      return result.status === 'limit_reached'
        ? { status: 'limit_reached', sessions: result.sessions ?? [] }
        : { status: result.status };
    },
    audit: (event: AuthAuditEvent) => auditRecorder(admin)(event),
  };
}

export function createLogoutGateway(): LogoutGateway {
  const admin = adminClient();
  return {
    authenticate: (accessToken) => authenticate(admin, accessToken).then((identity) => identity && { userId: identity.userId, sessionId: identity.sessionId }),
    endSession: (userId, sessionId, reason) =>
      rpc<boolean>(admin, 'end_user_session', { p_user_id: userId, p_session_id: sessionId, p_reason: reason }),
    audit: (event) => auditRecorder(admin)(event),
  };
}

export function createStatusGateway(): StatusGateway {
  const admin = adminClient();
  return {
    authenticate: (accessToken) => authenticate(admin, accessToken),
    validate: (userId, sessionId) =>
      rpc<SessionValidation>(admin, 'validate_user_session', { p_user_id: userId, p_session_id: sessionId }),
    upgradeAal: async (userId, sessionId) => {
      await rpc(admin, 'start_user_session', { p_user_id: userId, p_session_id: sessionId, p_aal: 'aal2' });
    },
    requiresMfa: async (userId) => {
      const result = await rpc<{ requires_mfa: boolean }>(admin, 'login_eligibility', { p_user_id: userId });
      return result.requires_mfa;
    },
    audit: (event) => auditRecorder(admin)(event),
  };
}
