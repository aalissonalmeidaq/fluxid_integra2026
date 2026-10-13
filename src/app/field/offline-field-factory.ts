import type { SupabaseClient } from '@supabase/supabase-js';
import { AttachmentService } from '@/application/field/attachment-service';
import { OfflineQueueService } from '@/application/field/offline-queue-service';
import { OfflineTripStore } from '@/application/field/offline-trip-store';
import { offlineSessionState } from '@/domain/field/offline-session';
import { createAttachmentUploader } from '@/infrastructure/attachments/attachment-transport';
import { getDeviceId } from '@/infrastructure/local-database/device-id';
import type { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { checkStorage } from '@/infrastructure/local-database/storage-persistence';
import { SyncOutbox } from '@/infrastructure/synchronization/sync-outbox';
import type { PublicEndpoint } from '@/infrastructure/supabase/function-transport';
import type { OfflineFieldValue } from './offline-field-context';

// A fila, a viagem guardada e os anexos do aparelho (Spec 010), montados sob demanda: este módulo carrega só depois de o aplicativo abrir, para o pacote de entrada
// não crescer (RNF-007). `OfflineFieldProvider` o importa com `import()`.
export interface OfflineFieldInputs {
  database: LocalDatabase;
  owner: { actorId: string; organizationId: string; endpointId: string };
  // Portões lidos na hora de registrar: a permissão atual e o instante da última confirmação do servidor.
  canOperate: () => boolean;
  confirmedAt: () => Date | null;
  // O envio dos anexos só acontece com a conexão ativa; sem ela, a tentativa falha como queda de rede e o anexo continua guardado.
  connection: () => { client: SupabaseClient; endpoint: PublicEndpoint } | null;
}

export function createOfflineField({ database, owner, canOperate, confirmedAt, connection }: OfflineFieldInputs): OfflineFieldValue {
  const trips = new OfflineTripStore(database, owner);
  const queue = new OfflineQueueService({
    outbox: new SyncOutbox(database),
    store: trips,
    owner: { ...owner, deviceId: getDeviceId() },
    canOperate,
    session: () => offlineSessionState(confirmedAt(), new Date()),
  });
  const uploader = {
    upload: (input: Parameters<ReturnType<typeof createAttachmentUploader>['upload']>[0]) => {
      const current = connection();
      return current ? createAttachmentUploader(current.endpoint, current.client).upload(input) : Promise.reject(new Error('sem_conexao'));
    },
  };
  const attachments = new AttachmentService({ database, owner, uploader });
  void attachments.markStaleUploadingPending().catch(() => undefined);
  // Pede ao navegador que não apague os dados do aplicativo (RF-026); a tela Sincronização mostra o resultado.
  void checkStorage();
  return { queue, trips, attachments };
}
