import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import type { Executor, ExecutorOutcome } from './operation-executors';
import { PushSynchronizer } from './push-synchronizer';
import { SyncOutbox } from './sync-outbox';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

const owner = { actorId: 'user-1', endpointId: 'local' };
const synced: ExecutorOutcome = { kind: 'synced', serverTimestamp: '2026-10-12T12:31:00Z', result: { code: 'CHECKED' } };

async function setup(options: { client?: boolean } = {}) {
  const name = `push-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock('tenant-a');
  const outbox = new SyncOutbox(database, { now: () => new Date('2026-10-12T12:00:00Z') });
  const invoke = vi.fn(async () => ({ error: null }));
  const clientManager = { current: () => (options.client === false ? null : { functions: { invoke } }) } as never;
  const enqueue = (over: Record<string, unknown> = {}) => outbox.enqueue({
    organizationId: 'tenant-a', actorId: 'user-1', deviceId: 'd1', operation: 'trip.check_item', payload: { trip_id: 'T1', item_id: 'I1' }, version: 1, endpointId: 'local', tripId: 'T1', ...over,
  } as never);
  return { database, outbox, invoke, clientManager, enqueue };
}
const push = (s: Awaited<ReturnType<typeof setup>>, executors: Record<string, Executor>, extra: Record<string, unknown> = {}) =>
  new PushSynchronizer(s.outbox, s.clientManager, { executors, owner, ...extra });

// Spec 010, T038 (RF-009, RF-010, RF-012, RF-016, RN-007): o envio usa os executores das operações de campo, na ordem das dependências, confirma e remove
// o item, preserva o conflito, interrompe sem perder nada e nunca envia item de outra conta nem de outro destino.
describe('envio das operações de campo', () => {
  it('confirmado: o item sai da fila por inteiro e o chamador é avisado', async () => {
    const s = await setup();
    const item = await s.enqueue();
    const executor = vi.fn<Executor>(async () => synced);
    const onSynced = vi.fn(async () => undefined);
    const result = await push(s, { 'trip.check_item': executor }, { onSynced }).push();
    expect(result).toMatchObject({ successful: 1, failed: 0, conflicts: 0, interrupted: false });
    expect(executor).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, idempotency_key: item.idempotency_key, status: 'syncing' }));
    expect(await s.outbox.list()).toEqual([]);
    expect(onSynced).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }), synced);
    await s.database.close();
  });

  it('respeita as dependências: a segunda operação só vai depois da primeira, e a primeira confirmada já saiu da fila', async () => {
    const s = await setup();
    const first = await s.enqueue({ operation: 'trip.arrive_stop', payload: { trip_id: 'T1', stop_id: 'S1' } });
    await s.enqueue({ operation: 'trip.deliver', payload: { trip_id: 'T1', stop_id: 'S1' }, dependencies: [first.id] });
    const order: string[] = [];
    const executors = {
      'trip.arrive_stop': vi.fn<Executor>(async () => { order.push('chegada'); return synced; }),
      'trip.deliver': vi.fn<Executor>(async () => { order.push('entrega'); return synced; }),
    };
    expect(await push(s, executors).push()).toMatchObject({ successful: 2 });
    expect(order).toEqual(['chegada', 'entrega']);
    expect(await s.outbox.list()).toEqual([]);
    await s.database.close();
  });

  it('conflito: o item fica preservado com o código do motivo, os dependentes esperam e o resto da fila segue', async () => {
    const s = await setup();
    const arrive = await s.enqueue({ operation: 'trip.arrive_stop', payload: { trip_id: 'T1', stop_id: 'S1' } });
    const deliver = await s.enqueue({ operation: 'trip.deliver', payload: { trip_id: 'T1', stop_id: 'S1' }, dependencies: [arrive.id] });
    const other = await s.enqueue({ operation: 'trip.check_item', payload: { trip_id: 'T2', item_id: 'I9' }, tripId: 'T2' });
    const conflict: ExecutorOutcome = { kind: 'conflict', reasonCode: 'TRIP_CLOSED', remote: {} };
    const onConflict = vi.fn(async () => undefined);
    const executors = {
      'trip.arrive_stop': async () => conflict, 'trip.deliver': vi.fn<Executor>(async () => synced), 'trip.check_item': async () => synced,
    };
    const result = await push(s, executors, { onConflict }).push();
    expect(result).toMatchObject({ successful: 1, conflicts: 0, fieldConflicts: 1, interrupted: false });
    const remaining = await s.outbox.list();
    expect(remaining.map((entry) => [entry.id, entry.status])).toEqual(expect.arrayContaining([[arrive.id, 'conflict'], [deliver.id, 'pending']]));
    expect(remaining.find((entry) => entry.id === arrive.id)?.failure_reason).toBe('TRIP_CLOSED');
    expect(remaining.some((entry) => entry.id === other.id)).toBe(false);
    expect(executors['trip.deliver']).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledWith(expect.objectContaining({ id: arrive.id }), conflict);
    await s.database.close();
  });

  it('sem sessão ou sem permissão: interrompe, devolve o item a pendente sem contar tentativa e não toca nos seguintes', async () => {
    const s = await setup();
    const first = await s.enqueue();
    await s.enqueue({ payload: { trip_id: 'T1', item_id: 'I2' } });
    const executor = vi.fn<Executor>(async () => ({ kind: 'interrupt', reason: 'auth_error' }));
    const result = await push(s, { 'trip.check_item': executor }).push();
    expect(result).toMatchObject({ interrupted: true, interruptionReason: 'auth_error' });
    expect(executor).toHaveBeenCalledTimes(1);
    const items = await s.outbox.list();
    expect(items.every((entry) => entry.status === 'pending' && entry.attempt_count === 0)).toBe(true);
    expect(items.find((entry) => entry.id === first.id)).toBeDefined();
    await s.database.close();
  });

  it('403 também interrompe como falha de sessão, sem virar conflito', async () => {
    const s = await setup();
    await s.enqueue();
    const result = await push(s, { 'trip.check_item': async () => ({ kind: 'interrupt', reason: 'forbidden' }) }).push();
    expect(result).toMatchObject({ interrupted: true, interruptionReason: 'auth_error', conflicts: 0 });
    await s.database.close();
  });

  it('falha de rede: conta uma tentativa, volta a pendente e para (sem laço imediato)', async () => {
    const s = await setup();
    await s.enqueue();
    const executor = vi.fn<Executor>(async () => ({ kind: 'retry', reason: 'network' }));
    const result = await push(s, { 'trip.check_item': executor }).push();
    expect(result).toMatchObject({ interrupted: true, interruptionReason: 'network_error' });
    expect(executor).toHaveBeenCalledTimes(1);
    const [item] = await s.outbox.list();
    expect(item).toMatchObject({ status: 'pending', attempt_count: 1, failure_reason: 'network_error' });
    await s.database.close();
  });

  it('erro do servidor (5xx) usa o motivo server_error', async () => {
    const s = await setup();
    await s.enqueue();
    const result = await push(s, { 'trip.check_item': async () => ({ kind: 'retry', reason: 'server' }) }).push();
    expect(result).toMatchObject({ interrupted: true, interruptionReason: 'server_error' });
    expect((await s.outbox.list())[0]).toMatchObject({ failure_reason: 'server_error' });
    await s.database.close();
  });

  it('depois de cinco tentativas o item vira "falhou" (aparece com "Tentar de novo"), sem ser apagado', async () => {
    const s = await setup();
    const item = await s.enqueue();
    const synchronizer = push(s, { 'trip.check_item': async () => ({ kind: 'retry', reason: 'network' }) });
    for (let attempt = 0; attempt < 5; attempt += 1) await synchronizer.push();
    expect((await s.outbox.list()).find((entry) => entry.id === item.id)).toMatchObject({ status: 'failed', attempt_count: 5 });
    await s.database.close();
  });

  it('exceção inesperada do executor é tratada como falha de rede', async () => {
    const s = await setup();
    await s.enqueue();
    const result = await push(s, { 'trip.check_item': async () => { throw new Error('inesperado com recebedor Fulano'); } }).push();
    expect(result).toMatchObject({ interrupted: true, interruptionReason: 'network_error' });
    expect(JSON.stringify(await s.outbox.list())).not.toContain('Fulano');
    await s.database.close();
  });

  it('sem cliente do destino, interrompe por rede e não chama o executor', async () => {
    const s = await setup({ client: false });
    await s.enqueue();
    const executor = vi.fn<Executor>(async () => synced);
    expect(await push(s, { 'trip.check_item': executor }).push()).toMatchObject({ interrupted: true, interruptionReason: 'network_error' });
    expect(executor).not.toHaveBeenCalled();
    await s.database.close();
  });
});

describe('só a fila desta conta e deste destino', () => {
  it('não envia item de outra conta nem de outro destino, e avisa quantos ficaram esperando o destino de origem', async () => {
    const s = await setup();
    await s.enqueue();
    await s.enqueue({ actorId: 'user-2' });
    await s.enqueue({ endpointId: 'cloud' });
    await s.enqueue({ endpointId: 'cloud', payload: { trip_id: 'T1', item_id: 'I7' } });
    const executor = vi.fn<Executor>(async () => synced);
    const result = await push(s, { 'trip.check_item': executor }).push();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ successful: 1, endpointMismatch: 2 });
    expect(await s.outbox.list()).toHaveLength(3);
    await s.database.close();
  });
});

describe('operações sem executor continuam como na Spec 002', () => {
  it('usam a função genérica sync-command', async () => {
    const s = await setup();
    await s.enqueue({ operation: 'future-domain.operation', payload: { value: 1 }, endpointId: undefined, tripId: undefined });
    const result = await new PushSynchronizer(s.outbox, s.clientManager).push();
    expect(result).toMatchObject({ successful: 1 });
    expect(s.invoke).toHaveBeenCalledWith('sync-command', expect.anything());
    await s.database.close();
  });
});

describe('itens que o envio não toca (skip)', () => {
  it('o portão da Spec 002 pode deixar as operações de campo para o envio próprio da fila', async () => {
    const s = await setup();
    await s.enqueue();
    await s.enqueue({ operation: 'future-domain.operation', payload: { value: 1 }, endpointId: undefined, tripId: undefined });
    const result = await new PushSynchronizer(s.outbox, s.clientManager, { skip: (item) => item.operation.startsWith('trip.') }).push();
    expect(result).toMatchObject({ successful: 1 });
    expect(s.invoke).toHaveBeenCalledTimes(1);
    expect((await s.outbox.list()).filter((entry) => entry.operation === 'trip.check_item')).toHaveLength(1);
    await s.database.close();
  });
});
