import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientManager } from '@/infrastructure/connectivity/supabase-client-manager';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { ConflictResolver } from './conflict-resolver';
import { SyncOutbox } from './sync-outbox';
import { createTenantSyncRunner } from './tenant-sync-runner';

const A = '20000000-0000-0000-0000-00000000000a';
const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

// Spec 010, T039 (RF-008, RF-012): as operações de campo têm envio próprio; o portão da inicialização não as envia nem fica bloqueado por elas ou
// pelos conflitos de campo, que se decidem na tela Sincronização.
async function setup() {
  const name = `runner-field-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock(A);
  const invoke = vi.fn(async () => ({ error: null }));
  const client = { functions: { invoke }, auth: { signOut: vi.fn() } } as unknown as SupabaseClient;
  const manager = new SupabaseClientManager<SupabaseClient>(() => client);
  await manager.activate({ kind: 'cloud', url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_teste' });
  const makeRunner = () => createTenantSyncRunner({ database, clientManager: manager, organizationId: A, verifySession: async () => true, confirmTenant: async () => true })(() => undefined);
  const outbox = new SyncOutbox(database);
  const field = () => outbox.enqueue({ organizationId: A, actorId: 'u1', deviceId: 'd', operation: 'trip.check_item', payload: { item_id: 'I1' }, version: 1, endpointId: 'local', tripId: 'T1' });
  return { database, makeRunner, outbox, field, invoke };
}

describe('portão de inicialização e fila de campo', () => {
  it('não envia as operações de campo e libera a área protegida', async () => {
    const s = await setup();
    await s.field();
    expect(await s.makeRunner().run()).toEqual({ state: 'ready' });
    expect(s.invoke).not.toHaveBeenCalled();
    expect(await s.outbox.list()).toHaveLength(1);
    await s.database.close();
  });

  it('operação de campo em conflito não bloqueia o portão', async () => {
    const s = await setup();
    const item = await s.field();
    await s.outbox.transition(item.id, 'syncing');
    await s.outbox.transition(item.id, 'conflict', { failureReason: 'TRIP_CLOSED' });
    await new ConflictResolver(s.database).registerFieldConflict({
      organizationId: A, outboxItemId: item.id, tripId: 'T1', reasonCode: 'TRIP_CLOSED', summary: { operation: 'trip.check_item', queuedAt: '2026-10-12T12:00:00Z' }, remote: {},
    });
    expect(await s.makeRunner().run()).toEqual({ state: 'ready' });
    await s.database.close();
  });

  it('o resto continua como na Spec 002: operação genérica é enviada pelo portão e conflito genérico bloqueia', async () => {
    const s = await setup();
    await s.outbox.enqueue({ organizationId: A, actorId: 'u1', deviceId: 'd', operation: 'future-domain.operation', payload: {}, version: 1 });
    expect(await s.makeRunner().run()).toEqual({ state: 'ready' });
    expect(s.invoke).toHaveBeenCalledWith('sync-command', expect.anything());
    await new ConflictResolver(s.database).register({
      organizationId: A, outboxItemId: 'x', entity: 'memberships', entityId: 'e', kind: 'concurrent_update', localVersion: { version: 1, data: null }, remoteVersion: { version: 2, data: null },
    });
    expect((await s.makeRunner().run()).state).toBe('conflict');
    await s.database.close();
  });
});
