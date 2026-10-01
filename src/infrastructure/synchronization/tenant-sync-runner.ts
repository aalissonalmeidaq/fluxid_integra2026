import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalDatabase } from '@/infrastructure/local-database/local-database';
import type { SupabaseClientManager } from '@/infrastructure/connectivity/supabase-client-manager';
import { PushSynchronizer } from './push-synchronizer';
import { SyncCoordinator, type SyncPhase } from './sync-coordinator';
import { SyncOutbox } from './sync-outbox';

export interface TenantSyncRunnerDeps {
  database: LocalDatabase;
  clientManager: SupabaseClientManager<SupabaseClient>;
  // O contexto sincronizado; a base local precisa estar desbloqueada exatamente neste tenant.
  organizationId: string;
  // Confirmam sessão e tenant no servidor; sem resposta confiável, a área operacional não é liberada (RF-052).
  verifySession: () => Promise<boolean>;
  confirmTenant: () => Promise<boolean>;
}

// Monta a sincronização do tenant ativo: push idempotente antes do pull, conflitos abertos bloqueiam e a liberação exige
// sessão, tenant e consistência mínima confirmados (RF-051, RF-052, RF-055). Nesta Spec a allowlist offline-safe é vazia,
// então a outbox só recebe operações de Specs de domínio futuras e nenhuma coleção é puxada.
export function createTenantSyncRunner(deps: TenantSyncRunnerDeps) {
  const { database, clientManager, organizationId } = deps;
  return (onPhase: (phase: SyncPhase) => void): SyncCoordinator => {
    const outbox = new SyncOutbox(database);
    const push = new PushSynchronizer(outbox, clientManager);
    return new SyncCoordinator({
      outbox,
      onPhase,
      push: () => push.push(),
      pull: async () => undefined,
      hasOpenConflicts: async () => (await database.list('local_sync_conflicts')).some((conflict) => !conflict.resolved_at),
      gates: {
        session: deps.verifySession,
        tenant: deps.confirmTenant,
        consistency: async () => {
          try {
            if (database.activeTenant !== organizationId) return false;
            return (await outbox.list()).every((item) => item.status !== 'syncing' && item.status !== 'conflict');
          } catch {
            return false;
          }
        },
      },
    });
  };
}
