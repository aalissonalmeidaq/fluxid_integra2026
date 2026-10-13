// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { OFFLINE_OPERATIONS, type OfflineOperation } from '@/domain/field/offline-queue-rules';
import { createTripExecutors, MANAGE_OPERATION_OF, type ExecutorTransport } from './operation-executors';
import type { OutboxItem } from './sync-outbox';

const ORG = '20000000-0000-4000-8000-00000000000a';
const NOW = new Date('2026-10-12T12:30:00Z');
const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({
  id: 'o1', idempotency_key: 'a0000000-0000-4000-8000-000000000001', organization_id: ORG, actor_id: 'user-1', device_id: 'd1', operation: 'trip.check_item',
  payload: { trip_id: 'T1', item_id: 'I1', source: 'camera' }, version: 1, dependencies: [], local_timestamp: '2026-10-12T12:00:00.000Z', endpoint_id: 'local', trip_id: 'T1',
  queued_at: '2026-10-12T12:00:00.000Z', server_timestamp: null, status: 'syncing', attempt_count: 0, failure_reason: null, created_at: '2026-10-12T12:00:00.000Z', updated_at: '2026-10-12T12:00:00.000Z', ...over,
});
const transport = (response: { status: number; body: unknown } | Error): ExecutorTransport & { call: ReturnType<typeof vi.fn> } =>
  ({ call: vi.fn(async () => { if (response instanceof Error) throw response; return response; }) }) as never;
const run = (t: ReturnType<typeof transport>, over: Partial<OutboxItem> = {}) => createTripExecutors(t, { now: () => NOW })[(over.operation ?? 'trip.check_item') as OfflineOperation](item(over));

// Spec 010, T037 (RF-009, RF-011, RF-012): cada item da outbox vira a chamada certa de manage-trips, com o request_id igual à chave de idempotência e a
// hora da fila; a resposta decide o estado do item e nunca vaza dado sensível em erro.
describe('chamada ao servidor', () => {
  it('cada operação da fila corresponde a uma operação do manage-trips', () => {
    expect(Object.keys(createTripExecutors(transport({ status: 200, body: {} }))).sort()).toEqual([...OFFLINE_OPERATIONS].sort());
    expect(MANAGE_OPERATION_OF).toEqual({ 'trip.check_item': 'check_item', 'trip.uncheck_item': 'uncheck_item', 'trip.arrive_stop': 'arrive_stop', 'trip.deliver': 'register_delivery' });
  });

  it('manda o corpo original com request_id da chave de idempotência, a organização e queued_at', async () => {
    const t = transport({ status: 200, body: { code: 'CHECKED' } });
    await run(t);
    expect(t.call).toHaveBeenCalledWith('manage-trips', {
      operation: 'check_item', organization_id: ORG, request_id: 'a0000000-0000-4000-8000-000000000001', queued_at: '2026-10-12T12:00:00.000Z', trip_id: 'T1', item_id: 'I1', source: 'camera',
    });
  });

  it('a entrega vai como register_delivery com tudo o que a pessoa informou', async () => {
    const t = transport({ status: 200, body: { code: 'DELIVERED', delivery_id: 'D1' } });
    await run(t, { operation: 'trip.deliver', payload: { trip_id: 'T1', stop_id: 'S1', delivered_at: '2026-10-12T11:58:00Z', recipient_name: 'Recebedor Fictício', results: [{ item_id: 'I1', delivered: true }] } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', expect.objectContaining({ operation: 'register_delivery', recipient_name: 'Recebedor Fictício', queued_at: '2026-10-12T12:00:00.000Z' }));
  });

  it('o payload não pode sobrescrever os campos do envio (request_id, organização, operação)', async () => {
    const t = transport({ status: 200, body: { code: 'CHECKED' } });
    await run(t, { payload: { trip_id: 'T1', item_id: 'I1', request_id: 'malicioso', organization_id: 'outra', operation: 'cancel_trip', queued_at: '1999-01-01T00:00:00Z' } });
    const sent = t.call.mock.calls[0]![1] as Record<string, unknown>;
    expect(sent).toMatchObject({ operation: 'check_item', organization_id: ORG, request_id: 'a0000000-0000-4000-8000-000000000001', queued_at: '2026-10-12T12:00:00.000Z' });
  });

  it('recusa executar item de operação que não é da fila', async () => {
    const executors = createTripExecutors(transport({ status: 200, body: {} }));
    expect(Object.prototype.hasOwnProperty.call(executors, 'trip.cancel')).toBe(false);
  });
});

describe('resposta do servidor', () => {
  it.each([['CHECKED'], ['UNCHECKED'], ['ARRIVED'], ['DELIVERED']])('200 %s: confirmado, com a hora da confirmação', async (code) => {
    expect(await run(transport({ status: 200, body: { code, replayed: true } }))).toEqual({ kind: 'synced', serverTimestamp: NOW.toISOString(), result: { code, replayed: true } });
  });

  it.each([
    [409, 'INVALID_TRANSITION'], [409, 'TRIP_CLOSED'], [409, 'STOP_CLOSED'], [409, 'VERSION_CONFLICT'], [409, 'STALE_OFFLINE_OPERATION'], [404, 'NOT_FOUND'], [400, 'VALIDATION_FAILED'], [409, 'TRIP_STATE_INVALID'],
  ])('%i %s vira conflito, com o código do motivo', async (status, code) => {
    expect(await run(transport({ status, body: { code } }))).toEqual({ kind: 'conflict', reasonCode: code, remote: {} });
  });

  it('o conflito leva só o estado do servidor sem dado sensível (de, para, entidade)', async () => {
    const body = { code: 'INVALID_TRANSITION', from: 'checked', to: 'checked', entity: 'item', recipient_name: 'Recebedor', latitude: -23.5, fields: [{ field: 'latitude', message: 'x' }] };
    expect(await run(transport({ status: 409, body }))).toEqual({ kind: 'conflict', reasonCode: 'INVALID_TRANSITION', remote: { from: 'checked', to: 'checked', entity: 'item' } });
  });

  it('código desconhecido ou malformado vira VALIDATION_FAILED, nunca o texto cru', async () => {
    expect(await run(transport({ status: 409, body: { code: 'texto livre com coordenada -23.5' } }))).toMatchObject({ kind: 'conflict', reasonCode: 'VALIDATION_FAILED' });
    expect(await run(transport({ status: 409, body: 'html' }))).toMatchObject({ kind: 'conflict', reasonCode: 'VALIDATION_FAILED' });
  });

  it('401 e 403 interrompem o envio (não são conflito)', async () => {
    expect(await run(transport({ status: 401, body: { code: 'AUTH_REQUIRED' } }))).toEqual({ kind: 'interrupt', reason: 'auth_error' });
    expect(await run(transport({ status: 403, body: { code: 'ACCESS_DENIED' } }))).toEqual({ kind: 'interrupt', reason: 'forbidden' });
  });

  it.each([[500], [502], [503], [429]])('%i volta a pendente para tentar de novo', async (status) => {
    expect(await run(transport({ status, body: {} }))).toEqual({ kind: 'retry', reason: 'server' });
  });

  it('falha de rede volta a pendente', async () => {
    expect(await run(transport(new Error('Failed to fetch')))).toEqual({ kind: 'retry', reason: 'network' });
  });

  it('o resultado de erro nunca repete o corpo nem a mensagem da falha', async () => {
    const result = await run(transport(new Error('falha com recebedor Fulano e posição -23.5')));
    expect(JSON.stringify(result)).not.toMatch(/Fulano|-23/);
  });
});
