import type { SupabaseClient } from '@supabase/supabase-js';
import { ConflictService } from '@/application/field/conflict-service';
import { summarizeConflict } from '@/application/field/conflict-summary';
import { FieldSyncService } from '@/application/field/field-sync-service';
import { settlePending } from '@/domain/field/offline-trip';
import { SupabaseClientManager } from '@/infrastructure/connectivity/supabase-client-manager';
import type { LocalDatabase } from '@/infrastructure/local-database/local-database';
import type { ValidatedEndpoint } from '@/config/environment';
import { createTripTransport } from '@/infrastructure/supabase/trip-adapter';
import { ConflictResolver } from '@/infrastructure/synchronization/conflict-resolver';
import { createTripExecutors } from '@/infrastructure/synchronization/operation-executors';
import { PushSynchronizer } from '@/infrastructure/synchronization/push-synchronizer';
import { createSenderLock } from '@/infrastructure/synchronization/sender-lock';
import { SyncOutbox } from '@/infrastructure/synchronization/sync-outbox';
import type { FieldSyncValue } from './field-sync-context';
import type { OfflineFieldValue } from './offline-field-context';

// O envio da fila de campo e as decisões sobre conflitos (Spec 010), montados sob demanda: este módulo carrega só depois de o aplicativo abrir, para o pacote de
// entrada não crescer (RNF-007). `FieldSyncProvider` o importa com `import()`.
export interface FieldSyncInputs {
  client: SupabaseClient;
  endpoint: ValidatedEndpoint;
  endpointId: string;
  database: LocalDatabase;
  activeOrganizationId: string;
  actorId: string;
  field: OfflineFieldValue;
  verifySession: (() => Promise<boolean>) | undefined;
  canOperate: () => boolean;
}

export function createFieldSync({ client, endpoint, endpointId, database, activeOrganizationId, actorId, field, verifySession, canOperate }: FieldSyncInputs): FieldSyncValue {
  const owner = { actorId, endpointId };
  const outbox = new SyncOutbox(database);
  const resolver = new ConflictResolver(database);
  const manager = new SupabaseClientManager<SupabaseClient>(() => client);
  void manager.activate(endpoint);
  const trip = createTripTransport(endpoint, client);
  const transport = { call: (_fn: 'manage-trips', body: Record<string, unknown>) => trip.call('manage-trips', body) };
  const executors = createTripExecutors(transport);
  const push = new PushSynchronizer(outbox, manager, {
    executors, owner,
    // Confirmado: a cópia da viagem perde a marca "pendente" do que não tem mais nada na fila.
    onSynced: async (item, outcome) => {
      // A entrega confirmada devolve o `delivery_id`: é só a partir dele que as fotos e a assinatura podem seguir (nunca antes do registro).
      if (item.operation === 'trip.deliver' && typeof outcome.result.delivery_id === 'string') await field.attachments.linkDelivery(item.id, outcome.result.delivery_id);
      if (!item.trip_id) return;
    const refs = await field.queue.pendingRefs(item.trip_id);
      await field.trips.update(item.trip_id, (current) => settlePending(current, refs));
    },
    // Recusado: o conflito é registrado só com o resumo sem dado sensível; os dados originais ficam no item da fila.
    onConflict: async (item, outcome) => {
      if (!item.trip_id) return;
    const current = await field.trips.get(item.trip_id);
      await resolver.registerFieldConflict({
        organizationId: item.organization_id, outboxItemId: item.id, tripId: item.trip_id, reasonCode: outcome.reasonCode, summary: summarizeConflict(item, current), remote: outcome.remote,
      });
    },
  });
  const lock = createSenderLock({ name: `fluxid-sync:${actorId}:${activeOrganizationId}` });
  const sync = new FieldSyncService({
    // Primeiro o registro, depois os anexos (RF-021): o atraso ou a recusa de um anexo nunca reverte nem bloqueia a entrega.
    push: async () => {
    const result = await push.push();
      if (!result.interrupted) await field.attachments.upload().catch(() => undefined);
      return result;
    },
    lock, verifySession: verifySession ?? (async () => false), isOnline: () => navigator.onLine !== false,
  });
  const conflicts = new ConflictService({
    outbox, resolver, store: field.trips, transport, organizationId: activeOrganizationId, owner, actorId,
    canOperate, isOnline: () => navigator.onLine !== false,
    onDiscarded: (discarded) => field.attachments.discardForItem(discarded.id),
  });
  return { sync, conflicts };
}
