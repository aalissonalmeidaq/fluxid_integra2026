import { json, preflight } from '../_shared/http.ts';

export type SessionValidation =
  | { status: 'active'; aal: 'aal1' | 'aal2'; expires_at: string }
  | { status: 'expired'; reason?: string }
  | { status: 'revoked' }
  | { status: 'missing' };

export interface StatusGateway {
  authenticate(accessToken: string): Promise<{ userId: string; sessionId: string; aal: 'aal1' | 'aal2' } | null>;
  validate(userId: string, sessionId: string): Promise<SessionValidation>;
  upgradeAal(userId: string, sessionId: string): Promise<void>;
  requiresMfa(userId: string): Promise<boolean>;
  audit(event: { action: 'auth.session.expire'; result: 'success'; actorId: string; sessionId: string; reason?: string }): Promise<void>;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

// Fronteira confiável de atividade: valida a sessão de governança e registra a atividade a cada chamada.
export function createSessionStatusHandler(gateway: StatusGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

    try {
      const token = bearerToken(request);
      const identity = token ? await gateway.authenticate(token) : null;
      if (!identity) return json({ code: 'SESSION_INVALID' }, 401);

      const validation = await gateway.validate(identity.userId, identity.sessionId);
      if (validation.status === 'active') {
        if (identity.aal === 'aal2' && validation.aal !== 'aal2') {
          await gateway.upgradeAal(identity.userId, identity.sessionId);
        }
        const aal = identity.aal === 'aal2' ? 'aal2' : validation.aal;
        // Perfil global em AAL1 só tem a sessão limitada ao fluxo MFA, inclusive ao restaurar a sessão.
        const mfaRequired = aal !== 'aal2' && await gateway.requiresMfa(identity.userId);
        return json({ code: 'SESSION_ACTIVE', aal, expires_at: validation.expires_at, mfa_required: mfaRequired });
      }
      if (validation.status === 'expired') {
        await gateway.audit({
          action: 'auth.session.expire', result: 'success', actorId: identity.userId,
          sessionId: identity.sessionId, ...(validation.reason ? { reason: validation.reason } : {}),
        });
        return json({ code: 'SESSION_EXPIRED', ...(validation.reason ? { reason: validation.reason } : {}) }, 401);
      }
      return json({ code: validation.status === 'revoked' ? 'SESSION_REVOKED' : 'SESSION_INVALID' }, 401);
    } catch {
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}
