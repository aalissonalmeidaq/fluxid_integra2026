import { createContext, useContext } from 'react';
import type { FieldSyncService } from '@/application/field/field-sync-service';
import type { ConflictService } from '@/application/field/conflict-service';

// O envio da fila de campo e as decisões sobre conflitos (Spec 010). Nulo enquanto algo não está pronto (sem sessão confirmada, sem destino, sem base local, ou com a
// sessão restaurada offline): nesse caso nada é enviado e a tela só mostra o que está na fila.
export interface FieldSyncValue {
  sync: FieldSyncService;
  conflicts: ConflictService;
}

export const FieldSyncContext = createContext<FieldSyncValue | null>(null);

export function useFieldSync(): FieldSyncValue | null {
  return useContext(FieldSyncContext);
}
