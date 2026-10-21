// Versão 2 (Spec 010): `local_trips` guarda a cópia da viagem para operar offline e `local_attachments` guarda foto e assinatura até o envio.
// As três lojas da versão 1 continuam como estavam, com os registros que já tinham.
export const LOCAL_DB_VERSION = 2;
export const LOCAL_STORES = ['local_outbox', 'local_sync_cursors', 'local_sync_conflicts', 'local_trips', 'local_attachments'] as const;
export type LocalStore = typeof LOCAL_STORES[number];
export interface LocalRecord { id: string; organization_id: string; [key: string]: unknown }
// Quem é dono do registro: a conta e o destino Supabase de origem (a organização vem da base desbloqueada). Outra conta, organização ou destino
// nunca vê nem envia o registro (Spec 010, RF-016).
export interface RecordOwner { actorId: string; endpointId: string }
const OWNER_INDEX = 'owner';

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
    const request = indexedDB.open(this.name, LOCAL_DB_VERSION);
    request.onupgradeneeded = () => {
      for (const storeName of LOCAL_STORES) {
        // Na atualização da versão 1, as lojas antigas são mantidas (com os registros) e só ganham o índice novo.
        const store = request.result.objectStoreNames.contains(storeName)
          ? request.transaction!.objectStore(storeName)
          : request.result.createObjectStore(storeName, { keyPath: 'id' });
        if (!store.indexNames.contains('organization_id')) store.createIndex('organization_id', 'organization_id', { unique: false });
        // Índice composto: só entram registros que têm conta, organização e destino (os da versão 1 continuam visíveis por `list`).
        if (!store.indexNames.contains(OWNER_INDEX)) store.createIndex(OWNER_INDEX, ['actor_id', 'organization_id', 'endpoint_id'], { unique: false });
      }
    };
    this.database = await requestResult(request);
  }

  storeNames(): string[] {
    this.assertOpen();
    return Array.from(this.database!.objectStoreNames);
  }

  unlock(organizationId: string): void { this.activeOrganizationId = organizationId; }
  isUnlocked(): boolean { return this.activeOrganizationId !== undefined; }
  lock(): void { this.activeOrganizationId = undefined; }
  
  get activeTenant(): string { return this.assertUnlocked(); }

  async close(): Promise<void> {
    this.database?.close();
    this.database = undefined;
    this.lock();
  }

  async put(store: LocalStore, record: LocalRecord): Promise<void> {
    const tenant = this.assertUnlocked();
    if (record.organization_id !== tenant) throw new Error('Registro pertence a outra empresa.');
    const transaction = this.database!.transaction(store, 'readwrite');
    transaction.objectStore(store).put(record);
    await transactionDone(transaction);
  }

  async list(store: LocalStore): Promise<LocalRecord[]> {
    const tenant = this.assertUnlocked();
    const transaction = this.database!.transaction(store, 'readonly');
    return requestResult(transaction.objectStore(store).index('organization_id').getAll(tenant)) as Promise<LocalRecord[]>;
  }

  // Registros do tenant ativo que pertencem a esta conta e a este destino.
  async listOwned(store: LocalStore, owner: RecordOwner): Promise<LocalRecord[]> {
    const tenant = this.assertUnlocked();
    const transaction = this.database!.transaction(store, 'readonly');
    return requestResult(transaction.objectStore(store).index(OWNER_INDEX).getAll([owner.actorId, tenant, owner.endpointId])) as Promise<LocalRecord[]>;
  }

  async transaction(stores: LocalStore[], operation: (tx: { put: (store: LocalStore, record: LocalRecord) => Promise<void> }) => Promise<void>): Promise<void> {
    const tenant = this.assertUnlocked();
    const transaction = this.database!.transaction(stores, 'readwrite');
    try {
      await operation({
        put: async (store, record) => {
          if (!stores.includes(store)) throw new Error('Store fora da transação.');
          if (record.organization_id !== tenant) throw new Error('Registro pertence a outra empresa.');
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
