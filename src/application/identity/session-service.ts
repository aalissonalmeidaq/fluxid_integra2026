import type { AssuranceLevel, ExpiryReason } from '@/domain/identity/session';

export interface SessionTransport {
  call(
    name: 'session-login' | 'session-logout' | 'session-status',
    body?: unknown,
    accessToken?: string,
  ): Promise<{ status: number; body: unknown }>;
}

export interface SessionStore {
  apply(session: { access_token: string; refresh_token: string }): Promise<void>;
  clear(): Promise<void>;
  accessToken(): Promise<string | null>;
}

export interface ActiveSessionSummary {
  session_id: string;
  started_at: string;
  last_seen_at: string;
  aal: string;
}

export interface LoginInput { email: string; password: string; revokeSessionId?: string }

export type LoginOutcome =
  | { kind: 'authenticated' }
  | { kind: 'mfa_required' }
  | { kind: 'session_limit'; sessions: ActiveSessionSummary[] }
  | { kind: 'invalid_credentials' }
  | { kind: 'account_unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'invalid_request' }
  | { kind: 'unavailable' };

export type SessionCheck =
  | { kind: 'active'; aal: AssuranceLevel; expiresAt: string; mfaRequired: boolean }
  | { kind: 'expired'; reason?: ExpiryReason }
  | { kind: 'revoked' }
  | { kind: 'missing' }
  | { kind: 'unreachable' };

interface Body { code?: unknown; session?: unknown; sessions?: unknown; aal?: unknown; expires_at?: unknown; reason?: unknown; mfa_required?: unknown }

const asBody = (value: unknown): Body => (value && typeof value === 'object' ? (value as Body) : {});

function asSession(value: unknown): { access_token: string; refresh_token: string } | null {
  if (!value || typeof value !== 'object') return null;
  const { access_token, refresh_token } = value as Record<string, unknown>;
  return typeof access_token === 'string' && typeof refresh_token === 'string' ? { access_token, refresh_token } : null;
}

// Casos de uso de sessão fora do React. Falhas de rede nunca concedem, prolongam ou encerram acesso
// por conta própria e nunca são tratadas como motivo de fallback de endpoint.
export class SessionService {
  constructor(private readonly transport: SessionTransport, private readonly store: SessionStore) {}

  async login(input: LoginInput): Promise<LoginOutcome> {
    let response: { status: number; body: unknown };
    try {
      response = await this.transport.call('session-login', {
        email: input.email,
        password: input.password,
        ...(input.revokeSessionId ? { revoke_session_id: input.revokeSessionId } : {}),
      });
    } catch {
      return { kind: 'unavailable' };
    }

    const body = asBody(response.body);
    switch (body.code) {
      case 'AUTHENTICATED':
      case 'MFA_REQUIRED': {
        const session = asSession(body.session);
        if (response.status !== 200 || !session) return { kind: 'unavailable' };
        await this.store.apply(session);
        return { kind: body.code === 'MFA_REQUIRED' ? 'mfa_required' : 'authenticated' };
      }
      case 'SESSION_LIMIT_REACHED':
        return { kind: 'session_limit', sessions: Array.isArray(body.sessions) ? (body.sessions as ActiveSessionSummary[]) : [] };
      case 'INVALID_CREDENTIALS':
        return { kind: 'invalid_credentials' };
      case 'ACCOUNT_UNAVAILABLE':
        return { kind: 'account_unavailable' };
      case 'RATE_LIMITED':
        return { kind: 'rate_limited' };
      case 'INVALID_REQUEST':
        return { kind: 'invalid_request' };
      default:
        return { kind: 'unavailable' };
    }
  }

  async logout(): Promise<void> {
    const token = await this.store.accessToken();
    if (token) {
      try {
        await this.transport.call('session-logout', undefined, token);
      } catch {
        // Sem rede o servidor não pôde revogar; o cliente ainda descarta a sessão local.
      }
    }
    await this.store.clear();
  }

  async check(): Promise<SessionCheck> {
    const token = await this.store.accessToken();
    if (!token) return { kind: 'missing' };

    let response: { status: number; body: unknown };
    try {
      response = await this.transport.call('session-status', undefined, token);
    } catch {
      return { kind: 'unreachable' };
    }

    const body = asBody(response.body);
    if (body.code === 'SESSION_ACTIVE' && typeof body.expires_at === 'string') {
      return { kind: 'active', aal: body.aal === 'aal2' ? 'aal2' : 'aal1', expiresAt: body.expires_at, mfaRequired: body.mfa_required === true };
    }
    if (body.code === 'SESSION_EXPIRED') {
      await this.store.clear();
      return body.reason === 'timebox' || body.reason === 'inactivity' ? { kind: 'expired', reason: body.reason } : { kind: 'expired' };
    }
    if (body.code === 'SESSION_REVOKED') {
      await this.store.clear();
      return { kind: 'revoked' };
    }
    if (body.code === 'SESSION_INVALID') {
      await this.store.clear();
      return { kind: 'missing' };
    }
    return { kind: 'unreachable' };
  }
}
