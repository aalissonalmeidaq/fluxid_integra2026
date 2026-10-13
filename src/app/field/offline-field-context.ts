import { createContext, useContext } from 'react';
import type { AttachmentService } from '@/application/field/attachment-service';
import type { OfflineQueueService } from '@/application/field/offline-queue-service';
import type { OfflineTripStore } from '@/application/field/offline-trip-store';

// A fila offline e a viagem guardada do aparelho para a conta, a organização e o destino ativos (Spec 010). Nulo enquanto algum deles não está
// pronto (sem sessão, sem organização ativa, base local ainda abrindo): nesse caso nada é enfileirado e a tela se comporta como na Spec 008.
export interface OfflineFieldValue {
  queue: OfflineQueueService;
  trips: OfflineTripStore;
  // Fotos e assinatura das entregas, guardadas no aparelho até o servidor confirmar.
  attachments: AttachmentService;
}

export const OfflineFieldContext = createContext<OfflineFieldValue | null>(null);

export function useOfflineField(): OfflineFieldValue | null {
  return useContext(OfflineFieldContext);
}
