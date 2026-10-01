export const LOCAL_STORES = ['local_outbox', 'local_sync_cursors', 'local_sync_conflicts'] as const;
export type LocalStore = typeof LOCAL_STORES[number];
export interface LocalRecord { id: string; organization_id: string; [key: string]: unknown }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha no IndexedDB.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Transação IndexedDB abortada.'));
  });
}

export class LocalDatabase {
  private database?: IDBDatabase;
  private activeOrganizationId?: string;

  constructor(private readonly name = 'fluxid-local') {}

  async open(): Promise<void> {
    if (this.database) return;
    const request = indexedDB.open(this.name, 1);
    request.onupgradeneeded = () => {
      for (const storeName of LOCAL_STORES) {
        if (!request.result.objectStoreNames.contains(storeName)) {
          const store = request.result.createObjectStore(storeName, { keyPath: 'id' });
          store.createIndex('organization_id', 'organization_id', { unique: false });
        }
      }
    };
    this.database = await requestResult(request);
  }

  storeNames(): string[] {
    this.assertOpen();
    return Array.from(this.database!.objectStoreNames);
  }

  unlock(organizationId: string): void { this.activeOrganizationId = organizationId; }
  lock(): void { this.activeOrganizationId = undefined; }
  
  get activeTenant(): string { return this.assertUnlocked(); }

  async close(): Promise<void> {
    this.database?.close();
    this.database = undefined;
    this.lock();
  }

  async put(store: LocalStore, record: LocalRecord): Promise<void> {
    const tenant = this.assertUnlocked();
    if (record.organization_id !== tenant) throw new Error('Registro pertence a outro tenant.');
    const transaction = this.database!.transaction(store, 'readwrite');
    transaction.objectStore(store).put(record);
    await transactionDone(transaction);
  }

  async list(store: LocalStore): Promise<LocalRecord[]> {
    const tenant = this.assertUnlocked();
    const transaction = this.database!.transaction(store, 'readonly');
    return requestResult(transaction.objectStore(store).index('organization_id').getAll(tenant)) as Promise<LocalRecord[]>;
  }

  async transaction(stores: LocalStore[], operation: (tx: { put: (store: LocalStore, record: LocalRecord) => Promise<void> }) => Promise<void>): Promise<void> {
    const tenant = this.assertUnlocked();
    const transaction = this.database!.transaction(stores, 'readwrite');
    try {
      await operation({
        put: async (store, record) => {
          if (!stores.includes(store)) throw new Error('Store fora da transação.');
          if (record.organization_id !== tenant) throw new Error('Registro pertence a outro tenant.');
          await requestResult(transaction.objectStore(store).put(record));
        },
      });
      await transactionDone(transaction);
    } catch (error) {
      try { transaction.abort(); } catch { /* já concluída */ }
      throw error;
    }
  }

  async discardOutbox(id: string, authorized: boolean): Promise<void> {
    this.assertUnlocked();
    if (!authorized) throw new Error('Autorização obrigatória para descarte da outbox.');
    const records = await this.list('local_outbox');
    if (!records.some((record) => record.id === id)) return;
    const transaction = this.database!.transaction('local_outbox', 'readwrite');
    transaction.objectStore('local_outbox').delete(id);
    await transactionDone(transaction);
  }

  async delete(store: LocalStore, id: string): Promise<void> {
    this.assertUnlocked();
    const records = await this.list(store);
    if (!records.some((record) => record.id === id)) return;
    const transaction = this.database!.transaction(store, 'readwrite');
    transaction.objectStore(store).delete(id);
    await transactionDone(transaction);
  }

  private assertOpen(): void {
    if (!this.database) throw new Error('Base local não foi aberta.');
  }

  private assertUnlocked(): string {
    this.assertOpen();
    if (!this.activeOrganizationId) throw new Error('Base local bloqueada.');
    return this.activeOrganizationId;
  }
}
