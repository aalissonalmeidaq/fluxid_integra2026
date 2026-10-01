import { createContext, useContext } from 'react';
import type { AuthState } from '@/domain/identity/session';
import type { LoginInput, LoginOutcome } from '@/application/identity/session-service';
import type { MfaService } from '@/application/identity/mfa-service';

export interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  // Confirma no servidor que a sessão alcançou AAL2 antes de liberar áreas que exigem MFA.
  confirmMfa: () => Promise<boolean>;
  // Confirma no servidor que a sessão continua ativa; sem resposta confiável não confirma (gate de sincronização).
  verifySession?: () => Promise<boolean>;
  mfa: MfaService | null;
}

export const AuthContext = createContext<AuthContextValue>({
  state: { status: 'checking' },
  login: async () => ({ kind: 'unavailable' }),
  logout: async () => undefined,
  confirmMfa: async () => false,
  verifySession: async () => false,
  mfa: null,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
