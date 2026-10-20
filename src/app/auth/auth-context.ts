import { createContext, useContext } from 'react';
import type { AuthState } from '@/domain/identity/session';
import type { LoginInput, LoginOutcome } from '@/application/identity/session-service';
import type { OfflineAccessRecord } from '@/domain/identity/offline-access';

export interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  // Confirma no servidor que a sessão continua ativa; sem resposta confiável não confirma (gate de sincronização).
  verifySession?: () => Promise<boolean>;
  // Spec 010: o registro do acesso offline restrito, só enquanto a sessão estiver restaurada offline (nulo com o servidor respondendo).
  offlineAccess?: OfflineAccessRecord | null;
  // Onde o registro é gravado e apagado (nulo quando o recurso está desligado, como nos testes).
  offlineAccessStore?: OfflineAccessStorePort | null;
}

export interface OfflineAccessStorePort {
  read(): Promise<unknown>;
  save(record: OfflineAccessRecord): Promise<boolean>;
  clear(): Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  state: { status: 'checking' },
  login: async () => ({ kind: 'unavailable' }),
  logout: async () => undefined,
  verifySession: async () => false,
  offlineAccess: null,
  offlineAccessStore: null,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
