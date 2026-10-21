import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalDatabase, LOCAL_STORES } from './local-database';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

function database() {
  const name = `fluxid-test-${crypto.randomUUID()}`;
  names.push(name);
  return new LocalDatabase(name);
}

describe('LocalDatabase IndexedDB', () => {
  it('cria as stores e restaura dados após reabrir', async () => {
    const db = database();
    await db.open();
    expect(db.storeNames()).toEqual(expect.arrayContaining([...LOCAL_STORES]));
    db.unlock('tenant-a');
    await db.put('local_sync_cursors', { id: 'cursor-1', organization_id: 'tenant-a', value: 7 });
    await db.close();
    await db.open();
    db.unlock('tenant-a');
    await expect(db.list('local_sync_cursors')).resolves.toEqual([expect.objectContaining({ value: 7 })]);
    await db.close();
  });

  it('executa escrita transacional e segrega por organization_id', async () => {
    const db = database(); await db.open(); db.unlock('tenant-a');
    await db.transaction(['local_outbox', 'local_sync_conflicts'], async (tx) => {
      await tx.put('local_outbox', { id: 'out-1', organization_id: 'tenant-a' });
      await tx.put('local_sync_conflicts', { id: 'conf-1', organization_id: 'tenant-a' });
    });
    expect(await db.list('local_outbox')).toHaveLength(1);
    db.unlock('tenant-b');
    expect(await db.list('local_outbox')).toHaveLength(0);
    await expect(db.put('local_outbox', { id: 'bad', organization_id: 'tenant-a' })).rejects.toThrow(/outra empresa/i);
    await db.close();
  });

  it('preserva mas bloqueia outbox no logout até reautenticação equivalente ou descarte autorizado', async () => {
    const db = database(); await db.open(); db.unlock('tenant-a');
    await db.put('local_outbox', { id: 'out-1', organization_id: 'tenant-a' });
    db.lock();
    await expect(db.list('local_outbox')).rejects.toThrow(/bloqueada/i);
    db.unlock('tenant-a');
    expect(await db.list('local_outbox')).toHaveLength(1);
    await expect(db.discardOutbox('out-1', false)).rejects.toThrow(/autorização/i);
    await db.discardOutbox('out-1', true);
    expect(await db.list('local_outbox')).toHaveLength(0);
    await db.close();
  });

  // Spec 010, T010: a base passa à versão 2 com as lojas da viagem guardada e dos anexos, mais a partição por conta, organização e destino.
  describe('versão 2 (Spec 010)', () => {
    const owner = { actorId: 'user-1', endpointId: 'local' };
    const record = (id: string, over: Record<string, unknown> = {}) => ({ id, organization_id: 'tenant-a', actor_id: 'user-1', endpoint_id: 'local', ...over });

    it('tem as cinco lojas, as três antigas e as duas novas', async () => {
      const db = database(); await db.open();
      expect(LOCAL_STORES).toEqual(['local_outbox', 'local_sync_cursors', 'local_sync_conflicts', 'local_trips', 'local_attachments']);
      expect(db.storeNames()).toEqual(expect.arrayContaining([...LOCAL_STORES]));
      await db.close();
    });

    it('atualiza a versão 1 sem perder a fila nem os conflitos pendentes', async () => {
      const name = `fluxid-test-${crypto.randomUUID()}`;
      names.push(name);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          for (const store of ['local_outbox', 'local_sync_cursors', 'local_sync_conflicts']) {
            request.result.createObjectStore(store, { keyPath: 'id' }).createIndex('organization_id', 'organization_id', { unique: false });
          }
        };
        request.onsuccess = () => {
          const tx = request.result.transaction(['local_outbox', 'local_sync_conflicts'], 'readwrite');
          tx.objectStore('local_outbox').put({ id: 'velho-1', organization_id: 'tenant-a', status: 'pending' });
          tx.objectStore('local_sync_conflicts').put({ id: 'conf-1', organization_id: 'tenant-a' });
          tx.oncomplete = () => { request.result.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
      const db = new LocalDatabase(name);
      await db.open();
      expect(db.storeNames()).toEqual(expect.arrayContaining(['local_trips', 'local_attachments']));
      db.unlock('tenant-a');
      expect(await db.list('local_outbox')).toEqual([expect.objectContaining({ id: 'velho-1', status: 'pending' })]);
      expect(await db.list('local_sync_conflicts')).toHaveLength(1);
      await db.close();
    });

    it('guarda e lê a viagem guardada e o anexo (com os bytes) na empresa ativa', async () => {
      const db = database(); await db.open(); db.unlock('tenant-a');
      await db.put('local_trips', record('trip-1', { snapshot: { status: 'in_progress' }, fetched_at: '2026-10-12T12:00:00Z' }));
      await db.put('local_attachments', record('att-1', { kind: 'photo', bytes: new Uint8Array([1, 2, 3]).buffer, content_type: 'image/jpeg', size_bytes: 3 }));
      expect(await db.list('local_trips')).toEqual([expect.objectContaining({ id: 'trip-1' })]);
      const [attachment] = await db.list('local_attachments');
      expect(new Uint8Array(attachment!.bytes as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
      await db.close();
    });

    it('listOwned devolve só o que é da conta, da organização ativa e do destino', async () => {
      const db = database(); await db.open(); db.unlock('tenant-a');
      await db.put('local_outbox', record('meu'));
      await db.put('local_outbox', record('de-outra-conta', { actor_id: 'user-2' }));
      await db.put('local_outbox', record('de-outro-destino', { endpoint_id: 'cloud' }));
      expect((await db.listOwned('local_outbox', owner)).map((item) => item.id)).toEqual(['meu']);
      db.unlock('tenant-b');
      expect(await db.listOwned('local_outbox', owner)).toEqual([]);
      await db.close();
    });

    it('registro sem conta ou destino (versão 1) não aparece em listOwned, mas continua em list', async () => {
      const db = database(); await db.open(); db.unlock('tenant-a');
      await db.put('local_outbox', { id: 'sem-dono', organization_id: 'tenant-a' });
      expect(await db.listOwned('local_outbox', owner)).toEqual([]);
      expect(await db.list('local_outbox')).toHaveLength(1);
      await db.close();
    });

    it('listOwned exige a base desbloqueada', async () => {
      const db = database(); await db.open();
      await expect(db.listOwned('local_outbox', owner)).rejects.toThrow(/bloqueada/i);
      await db.close();
    });
  });
});
