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
  it('cria as três stores e restaura dados após reabrir', async () => {
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
    await expect(db.put('local_outbox', { id: 'bad', organization_id: 'tenant-a' })).rejects.toThrow(/tenant/i);
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
});
