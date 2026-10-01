import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { SupabaseClientManager } from '@/infrastructure/connectivity/supabase-client-manager';
import { SyncOutbox } from './sync-outbox';
import type { SyncPhase } from './sync-coordinator';
import { createTenantSyncRunner } from './tenant-sync-runner';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

async function setup(invoke: ReturnType<typeof vi.fn> = vi.fn(async () => ({ error: null }))) {
  const name = `runner-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock(A);
  const client = { functions: { invoke }, auth: { signOut: vi.fn(async () => undefined) } } as unknown as SupabaseClient;
  const manager = new SupabaseClientManager<SupabaseClient>(() => client);
  await manager.activate({ kind: 'cloud', url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_teste' });
  const order: string[] = [];
  const verifySession = vi.fn(async () => { order.push('session'); return true; });
  const confirmTenant = vi.fn(async () => { order.push('tenant'); return true; });
  const phases: SyncPhase[] = [];
  const runner = createTenantSyncRunner({ database, clientManager: manager, organizationId: A, verifySession, confirmTenant })((phase) => { phases.push(phase); });
  const outbox = new SyncOutbox(database);
  const enqueue = () => outbox.enqueue({ organizationId: A, actorId: 'actor-1', deviceId: 'device-1', operation: 'future-domain.operation', payload: {}, version: 1 });
  return { database, runner, outbox, enqueue, invoke, verifySession, confirmTenant, phases, order, client };
}

describe('createTenantSyncRunner', () => {
  it('sem pendências percorre push, pull e preparação e confirma sessão e tenant antes de liberar', async () => {
    const { runner, phases, order, invoke } = await setup();
    expect(await runner.run()).toEqual({ state: 'ready' });
    expect(phases).toEqual(['pushing', 'pulling', 'preparing']);
    expect(order).toEqual(['session', 'tenant']);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('envia a pendência pelo destino ativo, de forma idempotente, e a marca como confirmada', async () => {
    const { runner, enqueue, outbox, invoke } = await setup();
    const item = await enqueue();
    expect((await runner.run()).state).toBe('ready');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('sync-command', { body: expect.objectContaining({ organization_id: A, idempotency_key: item.idempotency_key }) });
    expect((await outbox.list())[0]).toMatchObject({ id: item.id, status: 'synced' });
  });

  it('conflito aberto bloqueia antes do pull e dos gates', async () => {
    const { runner, database, phases, verifySession, confirmTenant } = await setup();
    await database.put('local_sync_conflicts', { id: 'c1', organization_id: A, entity_type: 'x' });
    expect((await runner.run()).state).toBe('conflict');
    expect(phases).toEqual(['pushing']);
    expect(verifySession).not.toHaveBeenCalled();
    expect(confirmTenant).not.toHaveBeenCalled();
  });

  it('conflito já resolvido não bloqueia', async () => {
    const { runner, database } = await setup();
    await database.put('local_sync_conflicts', { id: 'c1', organization_id: A, entity_type: 'x', resolved_at: '2026-09-30T10:00:00Z' });
    expect((await runner.run()).state).toBe('ready');
  });

  it('não libera quando a sessão não é confirmada', async () => {
    const { runner, verifySession, confirmTenant } = await setup();
    verifySession.mockResolvedValue(false);
    expect(await runner.run()).toEqual({ state: 'gate_failed', failedGate: 'session' });
    expect(confirmTenant).not.toHaveBeenCalled();
  });

  it('não libera quando o tenant não é confirmado', async () => {
    const { runner, confirmTenant } = await setup();
    confirmTenant.mockResolvedValue(false);
    expect(await runner.run()).toEqual({ state: 'gate_failed', failedGate: 'tenant' });
  });

  it('não libera quando a base local está travada em outro contexto (consistência mínima)', async () => {
    const { runner, database } = await setup();
    database.lock();
    database.unlock(B);
    expect(await runner.run()).toEqual({ state: 'gate_failed', failedGate: 'consistency' });
  });

  it('não libera quando a base local está travada', async () => {
    const { runner, database } = await setup();
    // A recuperação inicial lê a outbox; travada, a execução falha em vez de liberar a área.
    database.lock();
    await expect(runner.run()).rejects.toThrow(/bloqueada/i);
  });

  it('queda de rede preserva a pendência para nova tentativa e não libera', async () => {
    const { runner, enqueue, outbox } = await setup(vi.fn(async () => { throw new Error('offline'); }));
    await enqueue();
    expect((await runner.run()).state).toBe('interrupted');
    expect((await outbox.list())[0]).toMatchObject({ status: 'pending', attempt_count: 1, failure_reason: 'network_error' });
  });

  it('sessão recusada pelo servidor interrompe como sessão expirada', async () => {
    const { runner, enqueue } = await setup(vi.fn(async () => ({ error: { message: 'jwt', context: { status: 401 } } })));
    await enqueue();
    expect((await runner.run()).state).toBe('session_expired');
  });

  it('conflito de versão devolvido pelo servidor é preservado sem avançar', async () => {
    const { runner, enqueue, outbox } = await setup(vi.fn(async () => ({ error: { message: 'x', context: { status: 409 } } })));
    await enqueue();
    expect((await runner.run()).state).toBe('conflict');
    expect((await outbox.list())[0]?.status).toBe('conflict');
  });

  it('retoma item deixado em syncing por fechamento anterior sem duplicar o envio confirmado', async () => {
    const { runner, enqueue, outbox, invoke } = await setup();
    const item = await enqueue();
    await outbox.transition(item.id, 'syncing');
    expect((await runner.run()).state).toBe('ready');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect((await outbox.list())[0]?.status).toBe('synced');
  });
});
