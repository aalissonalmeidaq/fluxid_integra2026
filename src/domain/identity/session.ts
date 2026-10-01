export type AssuranceLevel = 'aal1' | 'aal2';
export type ExpiryReason = 'timebox' | 'inactivity';
export type AuthNotice = 'session_expired' | 'session_revoked' | 'signed_out';

export type AuthState =
  | { status: 'checking' }
  | { status: 'signed_out'; notice?: AuthNotice; reason?: ExpiryReason }
  | { status: 'mfa_required' }
  | { status: 'authenticated'; aal: AssuranceLevel };

export type AuthEvent =
  | { type: 'session_active'; aal: AssuranceLevel; mfaRequired?: boolean }
  | { type: 'session_missing' }
  | { type: 'session_invalid' }
  | { type: 'session_expired'; reason?: ExpiryReason }
  | { type: 'session_revoked' }
  | { type: 'login_succeeded' }
  | { type: 'login_requires_mfa' }
  | { type: 'mfa_verified' }
  | { type: 'logout' };

export const initialAuthState: AuthState = { status: 'checking' };

// Transições puras da autenticação; a decisão final de acesso sempre vem da fronteira confiável.
export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'session_active':
      return event.mfaRequired ? { status: 'mfa_required' } : { status: 'authenticated', aal: event.aal };
    case 'session_missing':
    case 'session_invalid':
      return { status: 'signed_out' };
    case 'session_expired':
      return { status: 'signed_out', notice: 'session_expired', ...(event.reason ? { reason: event.reason } : {}) };
    case 'session_revoked':
      return { status: 'signed_out', notice: 'session_revoked' };
    case 'login_succeeded':
      return { status: 'authenticated', aal: 'aal1' };
    case 'login_requires_mfa':
      return { status: 'mfa_required' };
    case 'mfa_verified':
      // Vale para o login de perfil global e para o desafio adicional de ações críticas.
      return state.status === 'mfa_required' || state.status === 'authenticated' ? { status: 'authenticated', aal: 'aal2' } : state;
    case 'logout':
      return { status: 'signed_out', notice: 'signed_out' };
  }
}

export function isProtectedAccessAllowed(state: AuthState, options: { requireAal2?: boolean } = {}): boolean {
  if (state.status !== 'authenticated') return false;
  return options.requireAal2 ? state.aal === 'aal2' : true;
}
