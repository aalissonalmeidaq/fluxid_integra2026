export type AssuranceLevel = 'aal1' | 'aal2';
export type ExpiryReason = 'timebox' | 'inactivity';
export type AuthNotice = 'session_expired' | 'session_revoked' | 'signed_out';

export type AuthState =
  | { status: 'checking' }
  | { status: 'signed_out'; notice?: AuthNotice; reason?: ExpiryReason }
  // `offline` (Spec 010, RF-016a): sessão restaurada pelo acesso offline restrito, sem confirmação do servidor; some quando o servidor confirmar.
  | { status: 'authenticated'; aal: AssuranceLevel; offline?: true };

export type AuthEvent =
  | { type: 'session_active'; aal: AssuranceLevel }
  | { type: 'session_offline_restored'; aal: AssuranceLevel }
  | { type: 'session_missing' }
  | { type: 'session_invalid' }
  | { type: 'session_expired'; reason?: ExpiryReason }
  | { type: 'session_revoked' }
  | { type: 'login_succeeded' }
  | { type: 'logout' };

export const initialAuthState: AuthState = { status: 'checking' };

// Transições puras da autenticação; a decisão final de acesso sempre vem da fronteira confiável.
export function authReducer(_state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'session_active':
      return { status: 'authenticated', aal: event.aal };
    case 'session_offline_restored':
      return { status: 'authenticated', aal: event.aal, offline: true };
    case 'session_missing':
    case 'session_invalid':
      return { status: 'signed_out' };
    case 'session_expired':
      return { status: 'signed_out', notice: 'session_expired', ...(event.reason ? { reason: event.reason } : {}) };
    case 'session_revoked':
      return { status: 'signed_out', notice: 'session_revoked' };
    case 'login_succeeded':
      return { status: 'authenticated', aal: 'aal1' };
    case 'logout':
      return { status: 'signed_out', notice: 'signed_out' };
  }
}

// Spec 013 (RF-021): o acesso é só com e-mail e senha para todos os perfis; nenhuma tela exige segundo fator.
export function isProtectedAccessAllowed(state: AuthState): boolean {
  return state.status === 'authenticated';
}
