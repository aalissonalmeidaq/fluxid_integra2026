import { json, preflight } from '../_shared/http.ts';

export interface LogoutGateway {
  // Devolve a identidade somente quando o Auth valida o token; caso contrário, null.
  authenticate(accessToken: string): Promise<{ userId: string; sessionId: string } | null>;
  endSession(userId: string, sessionId: string, reason: string): Promise<boolean>;
  audit(event: { action: 'auth.logout'; result: 'success'; actorId: string; sessionId: string }): Promise<void>;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

export function createSessionLogoutHandler(gateway: LogoutGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

    try {
      const token = bearerToken(request);
      const identity = token ? await gateway.authenticate(token) : null;
      // Escopo fixo `current`: revoga apenas a sessão do token; nunca as demais sessões do usuário.
      if (identity && await gateway.endSession(identity.userId, identity.sessionId, 'user_logout')) {
        await gateway.audit({ action: 'auth.logout', result: 'success', actorId: identity.userId, sessionId: identity.sessionId });
      }
      return json({ code: 'SIGNED_OUT' });
    } catch {
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}
