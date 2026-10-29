// Fila de posições do celular no aparelho (Spec 015, T047; RF-007d, RF-007h). Banco IndexedDB próprio, separado da fila de comandos da
// Spec 010: cada posição fica presa ao dono imutável (conta, empresa, destino, viagem e sessão) e só sai quando o servidor a confirma
// (gravada ou duplicada). A sequência é monotônica por dono e sobrevive ao fechamento do aplicativo. Nunca guarda token nem chave.
import type { CollectedPosition, QueuedPosition, QueueOwner, TrackingQueuePort } from '@/application/tracking/tracking-ports';

// 8 horas a uma posição por minuto são 480; a folga cobre entregas mais frequentes que a plataforma faça.
export const TRACKING_QUEUE_CAPACITY = 600;

const VERSION = 1;
const POSITIONS = 'positions';
const SEQUENCES = 'sequences';

interface StoredPosition extends QueuedPosition { ownerKey: string }

const ownerKey = (owner: QueueOwner) => [owner.userId, owner.organizationId, owner.endpointId, owner.tripId, owner.trackingSessionId].join('\u0001');

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha no IndexedDB.'));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Transação IndexedDB abortada.'));
  });
}

const strip = ({ ownerKey: _ownerKey, ...item }: StoredPosition): QueuedPosition => item;

export class IndexedDbTrackingQueue implements TrackingQueuePort {
  private database?: Promise<IDBDatabase>;

  constructor(private readonly name = 'fluxid-tracking') {}

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(POSITIONS)) {
          const store = db.createObjectStore(POSITIONS, { keyPath: 'clientPositionId' });
          store.createIndex('owner', 'ownerKey', { unique: false });
          store.createIndex('owner_sequence', ['ownerKey', 'sequenceNo'], { unique: true });
        }
        if (!db.objectStoreNames.contains(SEQUENCES)) db.createObjectStore(SEQUENCES, { keyPath: 'ownerKey' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir a fila de posições.'));
    });
    return this.database;
  }

  async close(): Promise<void> {
    if (!this.database) return;
    (await this.database).close();
    this.database = undefined;
  }

  async enqueue(owner: QueueOwner, position: CollectedPosition): Promise<QueuedPosition | 'full'> {
    const db = await this.open();
    const key = ownerKey(owner);
    const transaction = db.transaction([POSITIONS, SEQUENCES], 'readwrite');
    const positions = transaction.objectStore(POSITIONS);
    const sequences = transaction.objectStore(SEQUENCES);
    const pending = await result(positions.index('owner').count(key));
    if (pending >= TRACKING_QUEUE_CAPACITY) {
      transaction.abort();
      return 'full';
    }
    const last = (await result(sequences.get(key)) as { ownerKey: string; last: number } | undefined)?.last ?? 0;
    const item: StoredPosition = {
      clientPositionId: crypto.randomUUID(), sequenceNo: last + 1, owner: { ...owner }, ownerKey: key,
      observedAt: position.observedAt, latitude: position.latitude, longitude: position.longitude, accuracyM: position.accuracyM,
    };
    positions.put(item);
    sequences.put({ ownerKey: key, last: item.sequenceNo });
    await done(transaction);
    return strip(item);
  }

  async nextBatch(owner: QueueOwner, limit: number): Promise<QueuedPosition[]> {
    const db = await this.open();
    const key = ownerKey(owner);
    const range = IDBKeyRange.bound([key, 0], [key, Number.MAX_SAFE_INTEGER]);
    const items = await result(db.transaction(POSITIONS).objectStore(POSITIONS).index('owner_sequence').getAll(range, limit)) as StoredPosition[];
    return items.map(strip);
  }

  async remove(owner: QueueOwner, clientPositionIds: string[]): Promise<void> {
    const db = await this.open();
    const key = ownerKey(owner);
    const transaction = db.transaction(POSITIONS, 'readwrite');
    const store = transaction.objectStore(POSITIONS);
    for (const id of clientPositionIds) {
      const item = await result(store.get(id)) as StoredPosition | undefined;
      // Só o próprio dono remove: outro contexto nunca apaga nem envia a posição de origem.
      if (item && item.ownerKey === key) store.delete(id);
    }
    await done(transaction);
  }

  async count(owner: QueueOwner): Promise<number> {
    const db = await this.open();
    return result(db.transaction(POSITIONS).objectStore(POSITIONS).index('owner').count(ownerKey(owner)));
  }

  async owners(): Promise<QueueOwner[]> {
    const db = await this.open();
    const items = await result(db.transaction(POSITIONS).objectStore(POSITIONS).getAll()) as StoredPosition[];
    const unique = new Map<string, QueueOwner>();
    for (const item of items) if (!unique.has(item.ownerKey)) unique.set(item.ownerKey, item.owner);
    return [...unique.values()];
  }
}
