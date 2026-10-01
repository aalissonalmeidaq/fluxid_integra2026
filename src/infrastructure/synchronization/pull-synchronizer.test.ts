import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SyncCursor } from './sync-cursor';
import { PullSynchronizer } from './pull-synchronizer';
import { LocalDatabase } from '../local-database/local-database';
import { SyncOutbox } from './sync-outbox';
import { SupabaseClientManager } from '../connectivity/supabase-client-manager';
import 'fake-indexeddb/auto';

describe('PullSynchronizer & SyncCursor', () => {
  let database: LocalDatabase;
  let cursor: SyncCursor;
  let outbox: SyncOutbox;
  let clientManager: SupabaseClientManager<SupabaseClient>;
  let dbName: string;

  beforeEach(async () => {
    dbName = `test-tenant-${crypto.randomUUID()}`;
    database = new LocalDatabase(dbName);
    await database.open();
    database.unlock(dbName);
    cursor = new SyncCursor(database);
    outbox = new SyncOutbox(database);
    
    clientManager = new SupabaseClientManager(() => ({
      auth: { signOut: vi.fn() },
    } as unknown as SupabaseClient));
    
    await clientManager.activate({ kind: 'cloud', url: 'http://cloud', publishableKey: 'key' });
  });

  it('deve armazenar e recuperar cursor por organização, coleção e origem', async () => {
    const ts = new Date().toISOString();
    await cursor.advance('test-collection', 'cloud', ts);
    
    const current = await cursor.get('test-collection', 'cloud');
    expect(current).toBe(ts);
    
    const otherOrigin = await cursor.get('test-collection', 'lan');
    expect(otherOrigin).toBeNull();
  });

  it('pull não avança o cursor em caso de falha no fetch', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));
    const applier = vi.fn();
    
    const synchronizer = new PullSynchronizer(clientManager, cursor, database, outbox);
    
    await expect(synchronizer.pull('test-collection', fetcher, applier)).rejects.toThrow('Network error');
    
    const current = await cursor.get('test-collection', 'cloud');
    expect(current).toBeNull();
    expect(applier).not.toHaveBeenCalled();
  });

  it('pull não avança o cursor em caso de falha no applier (conflito/aplicação atômica)', async () => {
    const ts = new Date().toISOString();
    const fetcher = vi.fn().mockResolvedValue({ data: [{ id: 1, updated_at: ts }], error: null });
    const applier = vi.fn().mockRejectedValue(new Error('Applier conflict'));
    
    const synchronizer = new PullSynchronizer(clientManager, cursor, database, outbox);
    
    await expect(synchronizer.pull('test-collection', fetcher, applier)).rejects.toThrow('Applier conflict');
    
    const current = await cursor.get('test-collection', 'cloud');
    expect(current).toBeNull();
  });

  it('pull avança o cursor somente após aplicação atômica com sucesso', async () => {
    const ts = new Date().toISOString();
    const fetcher = vi.fn().mockResolvedValue({ data: [{ id: 1, updated_at: ts }], error: null });
    const applier = vi.fn().mockResolvedValue(undefined);
    
    const synchronizer = new PullSynchronizer(clientManager, cursor, database, outbox);
    await synchronizer.pull('test-collection', fetcher, applier);
    
    const current = await cursor.get('test-collection', 'cloud');
    expect(current).toBe(ts);
  });

  it('pull deve ser posterior ao push (rejeita se houver pendências na outbox)', async () => {
    await outbox.enqueue({ organizationId: dbName, actorId: 'actor', deviceId: 'dev', operation: 'op', payload: {}, version: 1 });
    
    const fetcher = vi.fn();
    const applier = vi.fn();
    
    const synchronizer = new PullSynchronizer(clientManager, cursor, database, outbox);
    
    await expect(synchronizer.pull('test-collection', fetcher, applier)).rejects.toThrow('Push deve preceder o pull');
    
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('pull avança o cursor corretamente considerando a data mais recente no batch (cache obsoleto atualizado)', async () => {
    const oldTs = new Date(Date.now() - 10000).toISOString();
    const newTs = new Date().toISOString();
    const fetcher = vi.fn().mockResolvedValue({ data: [{ id: 1, updated_at: oldTs }, { id: 2, updated_at: newTs }], error: null });
    const applier = vi.fn().mockResolvedValue(undefined);
    
    const synchronizer = new PullSynchronizer(clientManager, cursor, database, outbox);
    await synchronizer.pull('test-collection', fetcher, applier);
    
    const current = await cursor.get('test-collection', 'cloud');
    expect(current).toBe(newTs);
  });
  
  it('pull lida com RLS e erros de servidor (error em vez de exceção no fetcher)', async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } });
    const applier = vi.fn();
    
    const synchronizer = new PullSynchronizer(clientManager, cursor, database, outbox);
    
    await expect(synchronizer.pull('test-collection', fetcher, applier)).rejects.toThrow('RLS denied');
    
    const current = await cursor.get('test-collection', 'cloud');
    expect(current).toBeNull();
    expect(applier).not.toHaveBeenCalled();
  });
});
