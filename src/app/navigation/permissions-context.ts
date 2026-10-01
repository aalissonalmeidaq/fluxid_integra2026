import { createContext, useContext } from 'react';
import type { ActorPermissions } from '@/domain/navigation/visible-screens';

// loading: consulta em andamento; ready: permissões confirmadas pelo servidor; error: falha ou sem resposta no prazo;
// offline: sem rede, com as últimas permissões da mesma pessoa e tenant quando existirem. Fora de `ready` e `offline`
// nunca há permissões, e o menu mostra só as telas sem exigência (RF-007).
export type PermissionsStatus = 'loading' | 'ready' | 'error' | 'offline';

export interface PermissionsContextValue {
  status: PermissionsStatus;
  permissions: ActorPermissions | null;
  retry: () => void;
}

export const PermissionsContext = createContext<PermissionsContextValue>({
  status: 'loading',
  permissions: null,
  retry: () => undefined,
});

export function usePermissions(): PermissionsContextValue {
  return useContext(PermissionsContext);
}
