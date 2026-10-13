import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { offlineSessionState } from '@/domain/field/offline-session';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { SyncOutbox } from '@/infrastructure/synchronization/sync-outbox';
import { OfflineQueueService, type QueueRequest } from './offline-queue-service';
import { OfflineTripStore } from './offline-trip-store';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

const NOW = new Date('2026-10-12T12:00:00Z');
const owner = { actorId: 'user-1', endpointId: 'local', organizationId: 'tenant-a', deviceId: 'device-1' };

const rawTrip = (status: 'loading' | 'in_progress' = 'loading') => ({
  code: 'OK',
  fetched_at: '2026-10-12T11:59:00Z',
  trip: { id: 'T1', number: 7, planned_date: '2026-10-12', status, version: 3 },
  vehicle: { plate: 'OFT1001' },
  stops: [
    { id: 'S1', position: 1, status: status === 'in_progress' ? 'pending' : 'pending', arrived_at: null, site: { id: 'U1', name: 'Unidade 1', city: 'São Paulo', state: 'SP', customer_name: 'Hospital Alfa' } },
    { id: 'S2', position: 2, status: 'pending', arrived_at: null, site: { id: 'U2', name: 'Unidade 2', city: 'São Paulo', state: 'SP', customer_name: 'Hospital Alfa' } },
  ],
  items: [
    { id: 'I1', stop_id: 'S1', item_status: status === 'loading' ? 'planned' : 'in_transit', lock_status: 'none', cylinder: { id: 'C1', serial_number: 'OFT-001', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l' }, identifiers: ['QR-OFT-001'] },
    { id: 'I2', stop_id: 'S2', item_status: status === 'loading' ? 'planned' : 'in_transit', lock_status: 'none', cylinder: { id: 'C2', serial_number: 'OFT-002', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l' }, identifiers: ['QR-OFT-002'] },
  ],
  deliveries: [],
});

async function setup(options: { status?: 'loading' | 'in_progress'; canOperate?: boolean; sessionAllowed?: boolean; seed?: boolean } = {}) {
  const name = `queue-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock(owner.organizationId);
  const outbox = new SyncOutbox(database, { now: () => NOW });
  const store = new OfflineTripStore(database, owner, () => NOW);
  if (options.seed !== false) await store.save(rawTrip(options.status ?? 'loading'));
  const service = new OfflineQueueService({
    outbox, store, owner, now: () => NOW,
    canOperate: () => options.canOperate !== false,
    session: () => (options.sessionAllowed === false ? offlineSessionState(null, NOW) : offlineSessionState(new Date('2026-10-12T10:00:00Z'), NOW)),
  });
  return { database, outbox, store, service };
}

const check = (over: Partial<QueueRequest> = {}): QueueRequest => ({ operation: 'trip.check_item', tripId: 'T1', itemId: 'I1', body: { trip_id: 'T1', item_id: 'I1', source: 'camera' }, ...over } as QueueRequest);
const arrive = (stopId = 'S1'): QueueRequest => ({
  operation: 'trip.arrive_stop', tripId: 'T1', stopId, arrivedAt: '2026-10-12T11:55:00Z',
  body: { trip_id: 'T1', stop_id: stopId, arrived_at: '2026-10-12T11:55:00Z', latitude: -23.55, longitude: -46.633, accuracy_m: 12, position_source: 'gps', position_read_at: '2026-10-12T11:54:30Z' },
});
const deliver = (stopId = 'S1', itemId = 'I1'): QueueRequest => ({
  operation: 'trip.deliver', tripId: 'T1', stopId, results: [{ itemId, delivered: true }],
  body: { trip_id: 'T1', stop_id: stopId, delivered_at: '2026-10-12T11:58:00Z', recipient_name: 'Recebedor Fictício', results: [{ item_id: itemId, delivered: true, source: 'nfc' }] },
});

// RF-001, RF-002, RF-004, RF-005 e contracts/fila-local.md §2: enfileirar com permissão, viagem guardada e regras; nada é confirmado.
describe('OfflineQueueService.enqueue', () => {
  it('conferir: grava o pedido na fila com conta, destino, viagem e hora, e mostra "pendente" na cópia guardada', async () => {
    const { database, outbox, store, service } = await setup();
    const result = await service.enqueue(check());
    expect(result).toMatchObject({ kind: 'queued', counts: { checked: 1, total: 2 } });
    const [item] = await outbox.list();
    expect(item).toMatchObject({
      operation: 'trip.check_item', status: 'pending', actor_id: 'user-1', organization_id: 'tenant-a', endpoint_id: 'local', trip_id: 'T1', device_id: 'device-1',
      queued_at: NOW.toISOString(), payload: { trip_id: 'T1', item_id: 'I1', source: 'camera' },
    });
    expect((await store.get('T1'))?.items[0]).toMatchObject({ itemStatus: 'checked', pending: true });
    await database.close();
  });

  it('o pedido que entra na fila nunca leva o request_id nem a organização no corpo (o envio os acrescenta)', async () => {
    const { database, outbox, service } = await setup();
    await service.enqueue(check());
    const [item] = await outbox.list();
    expect(item!.payload).not.toHaveProperty('request_id');
    expect(item!.payload).not.toHaveProperty('organization_id');
    expect(item!.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    await database.close();
  });

  it('conferir de novo o mesmo cilindro já conferido é recusado sem criar nada', async () => {
    const { database, outbox, service } = await setup();
    await service.enqueue(check());
    expect(await service.enqueue(check())).toMatchObject({ kind: 'refused', reason: 'already_done' });
    expect(await outbox.list()).toHaveLength(1);
    await database.close();
  });

  it('sem permissão de operar viagens, recusa', async () => {
    const { database, outbox, service } = await setup({ canOperate: false });
    expect(await service.enqueue(check())).toMatchObject({ kind: 'refused', reason: 'forbidden' });
    expect(await outbox.list()).toEqual([]);
    await database.close();
  });

  it('com a sessão offline expirada (8 horas), recusa com o motivo e não guarda nada', async () => {
    const { database, outbox, service } = await setup({ sessionAllowed: false });
    expect(await service.enqueue(check())).toMatchObject({ kind: 'refused', reason: 'session_expired', message: 'Sessão offline expirada. Conecte-se para entrar de novo.' });
    expect(await outbox.list()).toEqual([]);
    await database.close();
  });

  it('sem a viagem guardada, recusa e pede para abri-la com conexão', async () => {
    const { database, service } = await setup({ seed: false });
    expect(await service.enqueue(check())).toMatchObject({ kind: 'refused', reason: 'trip_unavailable' });
    await database.close();
  });

  it('cilindro que não é da viagem guardada é recusado', async () => {
    const { database, service } = await setup();
    expect(await service.enqueue(check({ itemId: 'XX', body: { trip_id: 'T1', item_id: 'XX' } }))).toMatchObject({ kind: 'refused', reason: 'item_not_found' });
    await database.close();
  });

  it('conferir só vale com a viagem em carregamento; chegar e entregar só com ela em andamento', async () => {
    const running = await setup({ status: 'in_progress' });
    expect(await running.service.enqueue(check())).toMatchObject({ kind: 'refused', reason: 'invalid_state' });
    expect(await running.service.enqueue(arrive())).toMatchObject({ kind: 'queued' });
    await running.database.close();
    const loading = await setup({ status: 'loading' });
    expect(await loading.service.enqueue(arrive())).toMatchObject({ kind: 'refused', reason: 'invalid_state' });
    await loading.database.close();
  });

  it('chegar: põe a parada no local, pendente, e guarda a posição só no pedido da fila', async () => {
    const { database, outbox, store, service } = await setup({ status: 'in_progress' });
    await service.enqueue(arrive());
    expect((await store.get('T1'))?.stops[0]).toMatchObject({ status: 'on_site', arrivedAt: '2026-10-12T11:55:00Z', pending: true });
    expect((await outbox.list())[0]!.payload).toMatchObject({ latitude: -23.55, position_source: 'gps' });
    expect(JSON.stringify(await database.list('local_trips'))).not.toMatch(/-23\.55|latitude/);
    await database.close();
  });

  it('chegar de novo na mesma parada é recusado', async () => {
    const { database, service } = await setup({ status: 'in_progress' });
    await service.enqueue(arrive());
    expect(await service.enqueue(arrive())).toMatchObject({ kind: 'refused', reason: 'already_done' });
    await database.close();
  });

  it('entregar exige a chegada (do servidor ou da fila) e fecha a parada, pendente, sem o recebedor na cópia guardada', async () => {
    const { database, store, service } = await setup({ status: 'in_progress' });
    expect(await service.enqueue(deliver())).toMatchObject({ kind: 'refused', reason: 'invalid_state' });
    await service.enqueue(arrive());
    expect(await service.enqueue(deliver())).toMatchObject({ kind: 'queued' });
    const trip = await store.get('T1');
    expect(trip?.stops[0]).toMatchObject({ status: 'delivered', pending: true });
    expect(trip?.items[0]).toMatchObject({ itemStatus: 'delivered', pending: true });
    expect(JSON.stringify(await database.list('local_trips'))).not.toContain('Recebedor');
    await database.close();
  });

  it('entregar de novo uma parada já fechada é recusado', async () => {
    const { database, service } = await setup({ status: 'in_progress' });
    await service.enqueue(arrive());
    await service.enqueue(deliver());
    expect(await service.enqueue(deliver())).toMatchObject({ kind: 'refused', reason: 'already_done' });
    await database.close();
  });

  it('a entrega depende da chegada da mesma parada e a segunda conferência do mesmo cilindro depende da primeira', async () => {
    const { database, outbox, service } = await setup({ status: 'in_progress' });
    await service.enqueue(arrive());
    await service.enqueue(deliver());
    const all = await outbox.list();
    const first = all.find((item) => item.operation === 'trip.arrive_stop')!;
    const second = all.find((item) => item.operation === 'trip.deliver')!;
    expect(first.dependencies).toEqual([]);
    expect(second.dependencies).toEqual([first.id]);
    await database.close();
  });

  it('falha ao gravar na fila não mostra a operação como feita', async () => {
    const { database, store, service } = await setup();
    await database.close();
    const result = await service.enqueue(check());
    expect(result).toMatchObject({ kind: 'refused', reason: 'storage_failed' });
    void store;
  });
});

describe('desfazer a conferência', () => {
  it('de um pendente que nunca saiu do aparelho: remove da fila, sem evento no servidor, e volta a planejado', async () => {
    const { database, outbox, store, service } = await setup();
    await service.enqueue(check());
    const result = await service.enqueue({ operation: 'trip.uncheck_item', tripId: 'T1', itemId: 'I1', body: { trip_id: 'T1', item_id: 'I1' } });
    expect(result).toMatchObject({ kind: 'cancelled', counts: { checked: 0, total: 2 } });
    expect(await outbox.list()).toEqual([]);
    expect((await store.get('T1'))?.items[0]).toMatchObject({ itemStatus: 'planned' });
    await database.close();
  });

  it('de um cilindro conferido no servidor: vira uma operação nova na fila', async () => {
    const { database, outbox, store, service } = await setup();
    await store.update('T1', (trip) => ({ ...trip, items: trip.items.map((item) => (item.id === 'I1' ? { ...item, itemStatus: 'checked' } : item)) }));
    const result = await service.enqueue({ operation: 'trip.uncheck_item', tripId: 'T1', itemId: 'I1', body: { trip_id: 'T1', item_id: 'I1' } });
    expect(result).toMatchObject({ kind: 'queued' });
    expect((await outbox.list())[0]).toMatchObject({ operation: 'trip.uncheck_item' });
    expect((await store.get('T1'))?.items[0]).toMatchObject({ itemStatus: 'planned', pending: true });
    await database.close();
  });

  it('de um cilindro que não está conferido, recusa', async () => {
    const { database, service } = await setup();
    expect(await service.enqueue({ operation: 'trip.uncheck_item', tripId: 'T1', itemId: 'I1', body: { trip_id: 'T1', item_id: 'I1' } })).toMatchObject({ kind: 'refused', reason: 'already_done' });
    await database.close();
  });

  it('de um pendente que já teve tentativa de envio: não cancela, enfileira o desfazer', async () => {
    const { database, outbox, service } = await setup();
    await service.enqueue(check());
    const [item] = await outbox.list();
    await outbox.transition(item!.id, 'syncing');
    await outbox.registerFailure(item!.id, 'network');
    const result = await service.enqueue({ operation: 'trip.uncheck_item', tripId: 'T1', itemId: 'I1', body: { trip_id: 'T1', item_id: 'I1' } });
    expect(result.kind).toBe('queued');
    expect(await outbox.list()).toHaveLength(2);
    await database.close();
  });
});

describe('contagens e consultas da fila', () => {
  it('conta pendentes, enviando, conflitos, total e os mais antigos que 24 horas', async () => {
    const { database, outbox, service } = await setup();
    await service.enqueue(check());
    await service.enqueue(check({ itemId: 'I2', body: { trip_id: 'T1', item_id: 'I2' } }));
    expect(await service.counts(true)).toEqual({ pending: 2, syncing: 0, conflicts: 0, total: 2, oldPending: 0, online: true });
    const [first] = await outbox.list();
    await outbox.transition(first!.id, 'syncing');
    expect(await service.counts(false)).toMatchObject({ pending: 1, syncing: 1, total: 2, online: false });
    await database.close();
  });

  it('"tentar de novo" devolve um item que falhou a pendente, com a mesma chave de idempotência, e ignora os outros', async () => {
    const { database, outbox, service } = await setup();
    const queued = await service.enqueue(check());
    if (queued.kind !== 'queued') throw new Error('esperava enfileirar');
    expect(await service.retry(queued.itemId)).toBe(false);
    await outbox.transition(queued.itemId, 'syncing');
    await outbox.transition(queued.itemId, 'failed', { failureReason: 'NETWORK' });
    expect(await service.retry(queued.itemId)).toBe(true);
    const [item] = await service.list();
    expect(item).toMatchObject({ status: 'pending', idempotency_key: queued.requestId, attempt_count: 0 });
    expect(await service.retry('inexistente')).toBe(false);
    await database.close();
  });

  it('só a fila desta conta e deste destino', async () => {
    const { database, outbox, service } = await setup();
    await service.enqueue(check());
    await outbox.enqueue({ organizationId: 'tenant-a', actorId: 'user-2', deviceId: 'd', operation: 'trip.check_item', payload: {}, version: 1, endpointId: 'local', tripId: 'T1' });
    await outbox.enqueue({ organizationId: 'tenant-a', actorId: 'user-1', deviceId: 'd', operation: 'trip.check_item', payload: {}, version: 1, endpointId: 'cloud', tripId: 'T1' });
    expect(await service.list()).toHaveLength(1);
    expect((await service.counts(true)).total).toBe(1);
    await database.close();
  });

  it('pendingRefs diz quais cilindros e paradas têm mudança ainda na fila (para a abertura online não desfazê-la)', async () => {
    const { database, service } = await setup({ status: 'in_progress' });
    await service.enqueue(arrive());
    await service.enqueue(deliver());
    const refs = await service.pendingRefs('T1');
    expect([...refs.stopIds]).toEqual(['S1']);
    expect([...refs.itemIds]).toEqual(['I1']);
    expect(await service.hasPending('T1')).toBe(true);
    expect(await service.hasPending('OUTRA')).toBe(false);
    await database.close();
  });
});
