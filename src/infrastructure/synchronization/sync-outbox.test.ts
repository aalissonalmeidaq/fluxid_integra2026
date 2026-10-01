import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { SyncOutbox } from './sync-outbox';

const databaseNames: string[] = [];
afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

async function setup() {
  const name = `outbox-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock('tenant-a');
  const audit = vi.fn();
  return { database, audit, outbox: new SyncOutbox(database, { audit, now: () => new Date('2026-09-29T12:00:00Z') }) };
}

const command = {
  organizationId: 'tenant-a', actorId: 'actor-1', deviceId: 'device-1',
  operation: 'future-domain.operation', payload: { value: 1 }, version: 3,
};

describe('SyncOutbox', () => {
  it('enfileira UUID, chave idempotente, ator, dispositivo, versão e dependências', async () => {
    const { database, outbox } = await setup();
    const predecessor = await outbox.enqueue(command);
    const item = await outbox.enqueue({ ...command, dependencies: [predecessor.idempotency_key] });
    expect(item).toMatchObject({
      organization_id: 'tenant-a', actor_id: 'actor-1', device_id: 'device-1',
      version: 3, dependencies: [predecessor.idempotency_key], status: 'pending', attempt_count: 0,
      server_timestamp: null, failure_reason: null,
    });
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(item.idempotency_key).toMatch(/^[0-9a-f-]{36}$/i);
    await database.close();
  });

  it('aplica somente transições válidas e preserva synced até remoção explícita', async () => {
    const { database, outbox } = await setup();
    const item = await outbox.enqueue(command);
    await expect(outbox.transition(item.id, 'synced')).rejects.toThrow(/transição/i);
    await outbox.transition(item.id, 'syncing');
    const synced = await outbox.transition(item.id, 'synced', { serverTimestamp: '2026-09-29T12:01:00Z' });
    expect(synced.status).toBe('synced');
    expect(await outbox.list()).toHaveLength(1);
    await outbox.removeConfirmed(item.id);
    expect(await outbox.list()).toHaveLength(0);
    await database.close();
  });

  it.each(['conflict', 'discarded'] as const)('suporta o estado terminal %s', async (status) => {
    const { database, outbox } = await setup();
    const item = await outbox.enqueue(command);
    if (status === 'conflict') {
      await outbox.transition(item.id, 'syncing');
      expect((await outbox.transition(item.id, status, { failureReason: 'version_conflict' })).status).toBe(status);
    } else {
      expect((await outbox.discard(item.id, { authorized: true, actorId: 'actor-1' })).status).toBe(status);
    }
    await database.close();
  });

  it('limita falhas elegíveis a cinco tentativas e então marca failed', async () => {
    const { database, outbox } = await setup();
    const item = await outbox.enqueue(command);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await outbox.transition(item.id, 'syncing');
      const updated = await outbox.registerFailure(item.id, 'network');
      expect(updated.attempt_count).toBe(attempt);
      expect(updated.status).toBe(attempt === 5 ? 'failed' : 'pending');
    }
    await database.close();
  });

  it('exige autorização e auditoria para descarte', async () => {
    const { database, outbox, audit } = await setup();
    const item = await outbox.enqueue(command);
    await expect(outbox.discard(item.id, { authorized: false, actorId: 'actor-1' })).rejects.toThrow(/autorização/i);
    await outbox.discard(item.id, { authorized: true, actorId: 'actor-1' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'outbox.discard', itemId: item.id, actorId: 'actor-1' }));
    await database.close();
  });
});
