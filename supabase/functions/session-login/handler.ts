import { json, preflight, sha256Hex, UUID_PATTERN } from '../_shared/http.ts';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  last_seen_at: string;
  aal: string;
}

export type SignInResult =
  | { ok: false }
  | { ok: true; userId: string; sessionId: string; aal: 'aal1' | 'aal2'; session: AuthSession };

export type StartSessionResult =
  | { status: 'started' }
  | { status: 'ended' }
  | { status: 'limit_reached'; sessions: SessionSummary[] };

export interface AuthAuditEvent {
  action: 'auth.login' | 'auth.login.failed' | 'auth.login.rate_limited' | 'auth.session.limit_reached' | 'auth.session.revoke';
  result: 'success' | 'denied' | 'failed';
  actorId?: string;
  sessionId?: string;
  reason?: string;
}

export interface LoginGateway {
  isRateLimited(keyHash: string): Promise<boolean>;
  registerFailure(keyHash: string): Promise<void>;
  clearFailures(keyHash: string): Promise<void>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOutSession(accessToken: string): Promise<void>;
  eligibility(userId: string): Promise<{ eligible: boolean; requiresMfa: boolean }>;
  endSession(userId: string, sessionId: string, reason: string): Promise<boolean>;
  startSession(userId: string, sessionId: string, aal: 'aal1' | 'aal2'): Promise<StartSessionResult>;
  audit(event: AuthAuditEvent): Promise<void>;
}

interface LoginRequest {
  email: string;
  password: string;
  revokeSessionId?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parse(value: unknown): LoginRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.email !== 'string' || typeof body.password !== 'string') return null;
  const email = body.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || body.password.length === 0 || body.password.length > 256) return null;
  if (body.revoke_session_id === undefined) return { email, password: body.password };
  if (typeof body.revoke_session_id !== 'string' || !UUID_PATTERN.test(body.revoke_session_id)) return null;
  return { email, password: body.password, revokeSessionId: body.revoke_session_id };
}

export function createSessionLoginHandler(gateway: LoginGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

    try {
      const input = parse(await request.json().catch(() => null));
      if (!input) return json({ code: 'INVALID_REQUEST' }, 400);

      // O limitador usa somente o hash da identidade normalizada; nada de e-mail ou senha é persistido.
      const key = await sha256Hex(`login:${input.email}`);
      if (await gateway.isRateLimited(key)) {
        await gateway.audit({ action: 'auth.login.rate_limited', result: 'denied', reason: 'rate_limited' });
        return json({ code: 'RATE_LIMITED' }, 429);
      }

      const signedIn = await gateway.signIn(input.email, input.password);
      if (!signedIn.ok) {
        await gateway.registerFailure(key);
        await gateway.audit({ action: 'auth.login.failed', result: 'failed', reason: 'invalid_credentials' });
        return json({ code: 'INVALID_CREDENTIALS' }, 401);
      }

      const { userId, sessionId, session } = signedIn;
      const context = await gateway.eligibility(userId);
      if (!context.eligible) {
        await gateway.signOutSession(session.access_token);
        await gateway.audit({ action: 'auth.login', result: 'denied', actorId: userId, reason: 'account_unavailable' });
        return json({ code: 'ACCOUNT_UNAVAILABLE' }, 403);
      }

      // Encerramento explícito: só afeta sessão do próprio usuário autenticado; nada é revogado automaticamente.
      if (input.revokeSessionId) {
        const ended = await gateway.endSession(userId, input.revokeSessionId, 'user_revoked');
        if (ended) {
          await gateway.audit({ action: 'auth.session.revoke', result: 'success', actorId: userId, sessionId: input.revokeSessionId });
        }
      }

      const started = await gateway.startSession(userId, sessionId, signedIn.aal);
      if (started.status === 'limit_reached') {
        await gateway.signOutSession(session.access_token);
        await gateway.audit({ action: 'auth.session.limit_reached', result: 'denied', actorId: userId, reason: 'session_limit' });
        return json({ code: 'SESSION_LIMIT_REACHED', sessions: started.sessions }, 409);
      }
      if (started.status === 'ended') {
        await gateway.signOutSession(session.access_token);
        return json({ code: 'INVALID_CREDENTIALS' }, 401);
      }

      await gateway.clearFailures(key);
      await gateway.audit({ action: 'auth.login', result: 'success', actorId: userId, sessionId });
      return json({ code: context.requiresMfa ? 'MFA_REQUIRED' : 'AUTHENTICATED', session }, 200);
    } catch {
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}
