import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QueueRequest, QueueResult } from '@/application/field/offline-queue-service';
import { TripService, type OfflineQueuePort, type TripTransport } from './trip-service';

// Spec 010, T025 (RF-001, RF-003, CA-005): offline, as quatro operações de campo entram na fila; o resto continua devolvendo "offline". Online, nada muda.
const ORG = '20000000-0000-4000-8000-00000000000a';
const reply = (status: number, body: unknown) => ({ status, body });
const transport = (response: { status: number; body: unknown }): TripTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => response) }) as never;

afterEach(() => vi.restoreAllMocks());

const queue = (result: QueueResult): OfflineQueuePort & { enqueue: ReturnType<typeof vi.fn> } => ({ enqueue: vi.fn(async (_request: QueueRequest) => result) }) as never;
const queued = (over: Partial<Extract<QueueResult, { kind: 'queued' }>> = {}): QueueResult => ({ kind: 'queued', itemId: 'q1', requestId: 'r1', counts: { checked: 1, total: 4 }, ...over });
const offline = () => false;
const CLOCK = () => new Date('2026-10-12T12:00:00Z');

describe('fila offline (Spec 010)', () => {
  it('conferir offline enfileira o pedido (com o método de leitura) e responde "pendente"', async () => {
    const port = queue(queued());
    const t = transport(reply(200, {}));
    const outcome = await new TripService(t, offline, port, CLOCK).checkItem(ORG, 'T1', 'I1', undefined, 'camera');
    expect(outcome).toEqual({ kind: 'success', value: { checked: 1, total: 4 }, pending: { queueItemId: 'q1' } });
    expect(port.enqueue).toHaveBeenCalledWith({ operation: 'trip.check_item', tripId: 'T1', itemId: 'I1', body: { trip_id: 'T1', item_id: 'I1', source: 'camera' } });
    expect(t.call).not.toHaveBeenCalled();
  });

  it('conferir sem método de leitura não manda o campo source', async () => {
    const port = queue(queued());
    await new TripService(transport(reply(200, {})), offline, port, CLOCK).checkItem(ORG, 'T1', 'I1');
    expect(port.enqueue).toHaveBeenCalledWith(expect.objectContaining({ body: { trip_id: 'T1', item_id: 'I1' } }));
  });

  it('desfazer um pendente que nunca saiu do aparelho responde sucesso sem "pendente"', async () => {
    const outcome = await new TripService(transport(reply(200, {})), offline, queue({ kind: 'cancelled', counts: { checked: 0, total: 4 } }), CLOCK).uncheckItem(ORG, 'T1', 'I1');
    expect(outcome).toEqual({ kind: 'success', value: { checked: 0, total: 4 } });
  });

  it('desfazer uma conferência já enviada enfileira o desfazer', async () => {
    const port = queue(queued({ counts: { checked: 0, total: 4 } }));
    const outcome = await new TripService(transport(reply(200, {})), offline, port, CLOCK).uncheckItem(ORG, 'T1', 'I1');
    expect(outcome).toMatchObject({ kind: 'success', pending: { queueItemId: 'q1' } });
    expect(port.enqueue).toHaveBeenCalledWith({ operation: 'trip.uncheck_item', tripId: 'T1', itemId: 'I1', body: { trip_id: 'T1', item_id: 'I1' } });
  });

  it('chegar offline manda o horário do aparelho e a posição só no corpo da fila', async () => {
    const port = queue(queued());
    const outcome = await new TripService(transport(reply(200, {})), offline, port, CLOCK).arriveStop(ORG, 'T1', 'S1', undefined, {
      latitude: -23.55, longitude: -46.633, accuracyM: 12, source: 'gps', readAt: '2026-10-12T11:59:30Z',
    });
    expect(outcome).toEqual({ kind: 'success', value: { outOfOrder: false }, pending: { queueItemId: 'q1' } });
    expect(port.enqueue).toHaveBeenCalledWith({
      operation: 'trip.arrive_stop', tripId: 'T1', stopId: 'S1', arrivedAt: '2026-10-12T12:00:00.000Z',
      body: { trip_id: 'T1', stop_id: 'S1', arrived_at: '2026-10-12T12:00:00.000Z', latitude: -23.55, longitude: -46.633, accuracy_m: 12, position_source: 'gps', position_read_at: '2026-10-12T11:59:30Z' },
    });
  });

  it('chegar offline sem posição manda só o horário', async () => {
    const port = queue(queued());
    await new TripService(transport(reply(200, {})), offline, port, CLOCK).arriveStop(ORG, 'T1', 'S1');
    expect(port.enqueue).toHaveBeenCalledWith(expect.objectContaining({ body: { trip_id: 'T1', stop_id: 'S1', arrived_at: '2026-10-12T12:00:00.000Z' } }));
  });

  it('entregar offline enfileira o corpo completo e responde com a situação esperada da parada', async () => {
    const port = queue(queued());
    const value = {
      deliveredAt: '2026-10-12T11:58:00Z', recipientName: 'Recebedor Fictício', recipientRole: null, latitude: null, longitude: null, atSiteAddress: true, correctionReason: null,
      results: [{ itemId: 'I1', delivered: true, source: 'nfc' as const }, { itemId: 'I2', delivered: false, reason: 'Cliente ausente' }],
    };
    const outcome = await new TripService(transport(reply(200, {})), offline, port, CLOCK).registerDelivery(ORG, 'T1', 'S1', value as never);
    expect(outcome).toEqual({ kind: 'success', value: { deliveryId: '', stopStatus: 'with_divergence', outsideGeofence: null }, pending: { queueItemId: 'q1' } });
    const request = port.enqueue.mock.calls[0]![0] as Extract<QueueRequest, { operation: 'trip.deliver' }>;
    expect(request).toMatchObject({ operation: 'trip.deliver', tripId: 'T1', stopId: 'S1', results: [{ itemId: 'I1', delivered: true }, { itemId: 'I2', delivered: false }] });
    expect(request.body).toMatchObject({
      delivered_at: '2026-10-12T11:58:00Z', recipient_name: 'Recebedor Fictício', at_site_address: true,
      results: [{ item_id: 'I1', delivered: true, source: 'nfc' }, { item_id: 'I2', delivered: false, reason: 'Cliente ausente' }],
    });
  });

  it('todos entregues dá parada entregue', async () => {
    const value = { deliveredAt: '2026-10-12T11:58:00Z', recipientName: 'Fulano', results: [{ itemId: 'I1', delivered: true }] };
    const outcome = await new TripService(transport(reply(200, {})), offline, queue(queued()), CLOCK).registerDelivery(ORG, 'T1', 'S1', value as never);
    expect(outcome).toMatchObject({ kind: 'success', value: { stopStatus: 'delivered' } });
  });

  it('a correção de uma entrega exige conexão: não entra na fila', async () => {
    const port = queue(queued());
    const value = { deliveredAt: '2026-10-12T11:58:00Z', recipientName: 'Fulano', correctionReason: 'Troca de cilindro', results: [{ itemId: 'I1', delivered: true }] };
    expect(await new TripService(transport(reply(200, {})), offline, port, CLOCK).registerDelivery(ORG, 'T1', 'S1', value as never, 'D0')).toEqual({ kind: 'offline' });
    expect(port.enqueue).not.toHaveBeenCalled();
  });

  it('a recusa da fila vira um estado de tela com o motivo em texto', async () => {
    const port = queue({ kind: 'refused', reason: 'session_expired', message: 'Sessão offline expirada. Conecte-se para entrar de novo.' });
    expect(await new TripService(transport(reply(200, {})), offline, port, CLOCK).checkItem(ORG, 'T1', 'I1')).toEqual({
      kind: 'offline_refused', refusal: 'session_expired', message: 'Sessão offline expirada. Conecte-se para entrar de novo.',
    });
  });

  it.each(['startLoading', 'startTrip', 'completeTrip', 'cancelTrip', 'returnItem', 'registerUnlock', 'removeItem'] as const)('%s continua exigindo conexão', async (method) => {
    const port = queue(queued());
    const service = new TripService(transport(reply(200, {})), offline, port, CLOCK) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    expect(await service[method]!(ORG, 'T1', method === 'startLoading' || method === 'startTrip' || method === 'completeTrip' ? 1 : 'I1', 'x')).toEqual({ kind: 'offline' });
    expect(port.enqueue).not.toHaveBeenCalled();
  });

  it('as consultas offline continuam devolvendo offline (a viagem guardada é lida por outro caminho)', async () => {
    const port = queue(queued());
    expect(await new TripService(transport(reply(200, {})), offline, port, CLOCK).query(ORG, 'get_trip', {}, () => 1)).toEqual({ kind: 'offline' });
  });

  it('online, a fila não é usada e o servidor responde como sempre', async () => {
    const port = queue(queued());
    const t = transport(reply(200, { code: 'CHECKED', checked: 2, total: 4 }));
    const outcome = await new TripService(t, () => true, port, CLOCK).checkItem(ORG, 'T1', 'I1', 'req-1', 'manual');
    expect(outcome).toEqual({ kind: 'success', value: { checked: 2, total: 4 } });
    expect(port.enqueue).not.toHaveBeenCalled();
    expect(t.call).toHaveBeenCalledWith('manage-trips', expect.objectContaining({ operation: 'check_item', request_id: 'req-1' }));
  });

  it('sem fila configurada, offline continua devolvendo offline (comportamento da Spec 008)', async () => {
    expect(await new TripService(transport(reply(200, {})), offline).checkItem(ORG, 'T1', 'I1')).toEqual({ kind: 'offline' });
  });
});
