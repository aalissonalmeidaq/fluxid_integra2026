import { createContext, useContext } from 'react';
import type { SelectionState, TenantOption } from '@/domain/identity/tenant-selection';
import type { LocalDatabase } from '@/infrastructure/local-database/local-database';
import type { SelectResult } from '@/application/identity/tenant-context-service';

export interface TenantContextValue {
  // idle: sem sessão autenticada ou ainda carregando; ready: vínculos resolvidos; error: consulta sem resposta confiável.
  status: 'idle' | 'loading' | 'ready' | 'error';
  selection: SelectionState;
  // Organizações elegíveis do usuário (última consulta confiável).
  options: readonly TenantOption[];
  activeOrganizationId: string | null;
  // O usuário pediu para trocar de organização: a área do tenant fica indisponível até nova escolha.
  switching: boolean;
  select: (organizationId: string) => Promise<SelectResult>;
  beginSwitch: () => void;
  cancelSwitch: () => void;
  reload: () => Promise<void>;
  // Base local aberta (Spec 010): a fila offline e a viagem guardada vivem nela. Nula enquanto não abriu.
  database?: LocalDatabase | null;
}

export const TenantContext = createContext<TenantContextValue>({
  status: 'idle',
  selection: { kind: 'none' },
  options: [],
  activeOrganizationId: null,
  switching: false,
  select: async () => ({ ok: false, reason: 'unavailable' }),
  beginSwitch: () => undefined,
  cancelSwitch: () => undefined,
  reload: async () => undefined,
});

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}
