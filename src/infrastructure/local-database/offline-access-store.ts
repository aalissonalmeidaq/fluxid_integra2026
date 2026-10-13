import { parseOfflineAccess, type OfflineAccessRecord } from '@/domain/identity/offline-access';

// Base pequena e própria do acesso offline restrito (Spec 010, RF-016, RF-016a; research.md §19a). Fica fora da base `fluxid-local` porque esta só abre
// desbloqueada por tenant, e na abertura sem conexão ainda não há tenant ativo. Guarda **um** registro por aparelho, sem token nem dado de domínio.
const DB_NAME = 'fluxid-offline-access';
const STORE = 'access';
const KEY = 'current';
// Gravar a cada confirmação seria desperdício: no máximo uma vez por minuto, ou na hora quando a conta, a organização, o destino ou as permissões mudam.
const MIN_INTERVAL_MS = 60_000;

const request = <T>(operation: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error ?? new Error('Falha no IndexedDB.'));
});

export class OfflineAccessStore {
  private lastSaved: { record: OfflineAccessRecord; at: number } | null = null;

  constructor(private readonly name: string = DB_NAME, private readonly now: () => Date = () => new Date()) {}

  private async open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined' || indexedDB === null) return null;
    const opening = indexedDB.open(this.name, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE);
    };
    return request(opening);
  }

  // Registro bruto, para quem restaura validar (`restoreOfflineAccess`). Base indisponível devolve nulo: a abertura nunca quebra por isso.
  async read(): Promise<unknown> {
    try {
      const database = await this.open();
      if (!database) return null;
      try {
        return (await request(database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY))) ?? null;
      } finally {
        database.close();
      }
    } catch {
      return null;
    }
  }

  // Devolve se gravou. Só grava o que `parseOfflineAccess` aceita (qualquer campo extra, como token, é descartado).
  async save(record: OfflineAccessRecord): Promise<boolean> {
    const clean = parseOfflineAccess(record);
    if (!clean) return false;
    const nowMs = this.now().getTime();
    if (this.lastSaved && nowMs - this.lastSaved.at < MIN_INTERVAL_MS && sameIdentity(this.lastSaved.record, clean)) return false;
    try {
      const database = await this.open();
      if (!database) return false;
      try {
        const transaction = database.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(clean, KEY);
        await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error); });
      } finally {
        database.close();
      }
    } catch {
      return false;
    }
    this.lastSaved = { record: clean, at: nowMs };
    return true;
  }

  // Fim da sessão (saída, expiração ou revogação): o aparelho deixa de poder abrir offline.
  async clear(): Promise<void> {
    this.lastSaved = null;
    try {
      const database = await this.open();
      if (!database) return;
      try {
        const transaction = database.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).delete(KEY);
        await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error); });
      } finally {
        database.close();
      }
    } catch { /* sem base, não há o que apagar */ }
  }
}

const sameIdentity = (a: OfflineAccessRecord, b: OfflineAccessRecord): boolean =>
  a.actorId === b.actorId && a.organizationId === b.organizationId && a.endpointId === b.endpointId && a.aal === b.aal
  && a.displayName === b.displayName && a.permissions.length === b.permissions.length && a.permissions.every((code, index) => code === b.permissions[index]);
