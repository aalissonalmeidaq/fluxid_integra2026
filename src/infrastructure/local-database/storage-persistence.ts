import { ATTACHMENT_WARNING_RATIO, MAX_QUEUE_ATTACHMENT_BYTES } from '@/domain/field/attachment-limits';

// Armazenamento do aparelho para a fila offline (Spec 010, RF-026; contracts/fila-local.md §7): pede ao navegador que não apague os dados e
// acompanha o espaço. Só lê números; nada do conteúdo da fila passa por aqui.
export const NOT_PERSISTENT_MESSAGE = 'Este navegador pode apagar os dados do aplicativo se faltar espaço. Instale o aplicativo e envie o que está pendente assim que puder.';
export const LOW_SPACE_MESSAGE = 'O espaço neste aparelho está acabando. Envie o que está pendente e libere espaço.';

// Parte de `navigator.storage` que o aplicativo usa, para os testes simularem.
export interface StorageManagerLike {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
  estimate(): Promise<{ usage?: number; quota?: number }>;
}

export interface StorageStatus {
  persistent: boolean;
  lowSpace: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  // Texto do aviso (persistência primeiro, depois o espaço); nulo quando está tudo certo.
  warning: string | null;
}

const safe = async <T,>(call: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await call(); } catch { return fallback; }
};

export async function checkStorage(storage: StorageManagerLike | undefined = defaultStorage()): Promise<StorageStatus> {
  if (!storage) return { persistent: false, lowSpace: false, usageBytes: null, quotaBytes: null, warning: NOT_PERSISTENT_MESSAGE };
  let persistent = await safe(() => storage.persisted(), false);
  if (!persistent) persistent = await safe(() => storage.persist(), false);
  const estimate = await safe(() => storage.estimate(), {} as { usage?: number; quota?: number });
  const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
  const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
  // Pouco espaço: a cota inteira cabe menos que o limite da fila de anexos, ou o que sobra é menos que isso, ou 80% da cota já foi usada.
  const free = usageBytes !== null && quotaBytes !== null ? quotaBytes - usageBytes : null;
  const lowSpace = quotaBytes !== null && (quotaBytes < MAX_QUEUE_ATTACHMENT_BYTES
    || (free !== null && free < MAX_QUEUE_ATTACHMENT_BYTES)
    || (usageBytes !== null && usageBytes >= quotaBytes * ATTACHMENT_WARNING_RATIO));
  return { persistent, lowSpace, usageBytes, quotaBytes, warning: !persistent ? NOT_PERSISTENT_MESSAGE : lowSpace ? LOW_SPACE_MESSAGE : null };
}

function defaultStorage(): StorageManagerLike | undefined {
  const manager = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { storage?: Partial<StorageManagerLike> }).storage;
  if (!manager?.persisted || !manager.persist || !manager.estimate) return undefined;
  return manager as StorageManagerLike;
}
