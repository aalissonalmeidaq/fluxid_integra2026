import { createContext, useContext } from 'react';
import type { SyncPhase, SyncRunResult } from '@/infrastructure/synchronization/sync-coordinator';

export interface SyncRunner {
  run(options?: { signal?: AbortSignal }): Promise<SyncRunResult>;
}

export interface SyncContextValue {
  // Cria um executor de sincronização por tentativa e recebe o andamento das fases.
  // `null` significa que não há nada a sincronizar: a allowlist offline-safe da Spec 002 é vazia.
  createRunner: ((onPhase: (phase: SyncPhase) => void) => SyncRunner) | null;
  // O tenant ativo ainda está sendo resolvido: a área protegida não abre antes de sincronizar (RF-051).
  resolving?: boolean;
  // Nova tentativa quando a resolução demora além do teto.
  retryResolving?: () => void;
}

export const SyncContext = createContext<SyncContextValue>({ createRunner: null, resolving: false });

export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}
