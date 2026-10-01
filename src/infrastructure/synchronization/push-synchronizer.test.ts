import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PushSynchronizer } from './push-synchronizer';
import { SyncOutbox } from './sync-outbox';
import { LocalDatabase } from '../local-database/local-database';
import { SupabaseClientManager } from '../connectivity/supabase-client-manager';
import 'fake-indexeddb/auto';

describe('PushSynchronizer', () => {
  let database: LocalDatabase;
  let outbox: SyncOutbox;
  let clientManager: SupabaseClientManager<SupabaseClient>;
  let invokeMock: ReturnType<typeof vi.fn>;
  let dbName: string;

  beforeEach(async () => {
    dbName = `test-tenant-${crypto.randomUUID()}`;
    database = new LocalDatabase(dbName);
    await database.open();
    database.unlock(dbName);
    outbox = new SyncOutbox(database);
    
    invokeMock = vi.fn();
    clientManager = new SupabaseClientManager(() => ({
      auth: { signOut: vi.fn() },
      functions: { invoke: invokeMock }
    } as unknown as SupabaseClient));
    
    await clientManager.activate({ kind: 'cloud', url: 'http://cloud', publishableKey: 'key' });
  });

  it('deve respeitar a ordem de dependências', async () => {
    const item1 = await outbox.enqueue({ organizationId: dbName, actorId: 'actor', deviceId: 'dev', operation: 'op1', payload: {}, version: 1 });
    await outbox.enqueue({ organizationId: dbName, actorId: 'actor', deviceId: 'dev', operation: 'op2', payload: {}, version: 1, dependencies: [item1.id] });

    invokeMock.mockResolvedValue({ data: { status: 'created' }, error: null });

    const synchronizer = new PushSynchronizer(outbox, clientManager);
    const result = await synchronizer.push();

    expect(result.successful).toBe(2);
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'sync-command', expect.objectContaining({ body: expect.objectContaining({ operation: 'op1' }) }));
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'sync-command', expect.objectContaining({ body: expect.objectContaining({ operation: 'op2' }) }));
    
    const items = await outbox.list();
    expect(items.every(i => i.status === 'synced')).toBe(true);
  });

  it('deve interromper o envio por erro de sessão ou tenant sem fallback', async () => {
    await outbox.enqueue({ organizationId: dbName, actorId: 'actor', deviceId: 'dev', operation: 'op1', payload: {}, version: 1 });
    
    invokeMock.mockResolvedValue({ data: null, error: { context: { status: 403, json: { error: 'tenant_actor_mismatch' } } } });

    const synchronizer = new PushSynchronizer(outbox, clientManager);
    const result = await synchronizer.push();

    expect(result.failed).toBe(1);
    expect(result.interrupted).toBe(true);
    
    const items = await outbox.list();
    expect(items[0]?.status).toBe('failed');
  });

  it('deve marcar como conflict se servidor retornar 409', async () => {
    await outbox.enqueue({ organizationId: dbName, actorId: 'actor', deviceId: 'dev', operation: 'op1', payload: {}, version: 1 });
    
    invokeMock.mockResolvedValue({ data: null, error: { context: { status: 409 } } });

    const synchronizer = new PushSynchronizer(outbox, clientManager);
    const result = await synchronizer.push();

    expect(result.conflicts).toBe(1);
    
    const items = await outbox.list();
    expect(items[0]?.status).toBe('conflict');
  });

  describe('falhas devolvidas pelo cliente (o supabase-js não lança exceção)', () => {
    const enqueue = () => outbox.enqueue({ organizationId: dbName, actorId: 'actor', deviceId: 'dev', operation: 'op1', payload: {}, version: 1 });

    it('queda de rede interrompe após uma única tentativa e preserva o item para nova tentativa', async () => {
      await enqueue();
      invokeMock.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('Failed to fetch') } });
      const result = await new PushSynchronizer(outbox, clientManager).push();
      expect(result).toMatchObject({ interrupted: true, interruptionReason: 'network_error', failed: 1 });
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect((await outbox.list())[0]).toMatchObject({ status: 'pending', attempt_count: 1, failure_reason: 'network_error' });
    });

    it('erro 5xx do servidor interrompe após uma única tentativa, sem laço de repetição imediata', async () => {
      await enqueue();
      invokeMock.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status: 503 } } });
      const result = await new PushSynchronizer(outbox, clientManager).push();
      expect(result).toMatchObject({ interrupted: true, interruptionReason: 'server_error' });
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect((await outbox.list())[0]).toMatchObject({ status: 'pending', attempt_count: 1, failure_reason: 'server_error' });
    });

    it('rejeição de validação (4xx) não é repetida: o item falha com motivo sanitizado', async () => {
      await enqueue();
      invokeMock.mockResolvedValue({ data: null, error: { message: 'detalhe interno com dados', context: { status: 422 } } });
      const result = await new PushSynchronizer(outbox, clientManager).push();
      expect(result).toMatchObject({ failed: 1, interrupted: false });
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect((await outbox.list())[0]).toMatchObject({ status: 'failed', failure_reason: 'rejected_422' });
    });

    it('não grava a mensagem bruta do erro como motivo da falha', async () => {
      await enqueue();
      invokeMock.mockResolvedValue({ data: null, error: { message: 'token=abc123 vazou', context: { status: 401 } } });
      await new PushSynchronizer(outbox, clientManager).push();
      expect(JSON.stringify(await outbox.list())).not.toContain('abc123');
    });

    it('a quinta falha de rede consecutiva marca o item como failed (limite de tentativas)', async () => {
      await enqueue();
      invokeMock.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'x', context: new TypeError('Failed to fetch') } });
      const synchronizer = new PushSynchronizer(outbox, clientManager);
      for (let attempt = 1; attempt <= 5; attempt += 1) await synchronizer.push();
      expect((await outbox.list())[0]).toMatchObject({ status: 'failed', attempt_count: 5 });
    });
  });

  it('não deve enviar simultaneamente', async () => {
    const synchronizer = new PushSynchronizer(outbox, clientManager);
    // força o status pra simular que está rodando
    const promise1 = synchronizer.push();
    const promise2 = synchronizer.push();
    
    await expect(promise2).rejects.toThrow('Push já está em andamento.');
    await promise1;
  });
});
