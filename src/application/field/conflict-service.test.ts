import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { ConflictResolver } from '@/infrastructure/synchronization/conflict-resolver';
import { SyncOutbox } from '@/infrastructure/synchronization/sync-outbox';
import { ConflictService } from './conflict-service';
import { OfflineTripStore } from './offline-trip-store';
import { summarizeConflict } from './conflict-summary';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

const owner = { actorId: 'user-1', endpointId: 'local', organizationId: 'tenant-a' };
const rawTrip = () => ({
  code: 'OK', fetched_at: '2026-10-12T11:59:00Z', trip: { id: 'T1', number: 7, planned_date: '2026-10-12', status: 'in_progress', version: 3 }, vehicle: { plate: 'OFT1001' },
  stops: [{ id: 'S1', position: 1, status: 'pending', arrived_at: null, site: { id: 'U1', name: 'Unidade 1', city: 'São Paulo', state: 'SP', customer_name: 'Hospital Alfa' } }],
  items: [{ id: 'I1', stop_id: 'S1', item_status: 'in_transit', lock_status: 'none', cylinder: { id: 'C1', serial_number: 'OFT-001', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l' }, identifiers: [] }],
  deliveries: [],
});

async function setup(options: { canOperate?: boolean; online?: boolean; response?: { status: number; body: unknown } | Error } = {}) {
  const name = `conflict-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock('tenant-a');
  const outbox = new SyncOutbox(database);
  const resolver = new ConflictResolver(database);
  const store = new OfflineTripStore(database, owner);
  await store.save(rawTrip());
  const call = vi.fn(async () => {
    const response = options.response ?? { status: 200, body: { code: 'RESOLVED' } };
    if (response instanceof Error) throw response;
    return response;
  });
  let n = 0;
  const service = new ConflictService({
    outbox, resolver, store, transport: { call } as never, organizationId: 'tenant-a', owner: { actorId: 'user-1', endpointId: 'local' }, actorId: 'user-1', canOperate: () => options.canOperate !== false,
    isOnline: () => options.online !== false, newRequestId: () => `b0000000-0000-4000-8000-00000000000${++n}`,
  });
  // Uma chegada e uma entrega que dependem dela; a chegada foi recusada (conflito).
  const arrive = await outbox.enqueue({ organizationId: 'tenant-a', actorId: 'user-1', deviceId: 'd', operation: 'trip.arrive_stop', payload: { trip_id: 'T1', stop_id: 'S1', latitude: -23.55, longitude: -46.633, position_source: 'gps' }, version: 1, endpointId: 'local', tripId: 'T1' });
  const deliver = await outbox.enqueue({ organizationId: 'tenant-a', actorId: 'user-1', deviceId: 'd', operation: 'trip.deliver', payload: { trip_id: 'T1', stop_id: 'S1', recipient_name: 'Recebedor Sigiloso', results: [{ item_id: 'I1', delivered: true }] }, version: 1, dependencies: [arrive.id], endpointId: 'local', tripId: 'T1' });
  await outbox.transition(arrive.id, 'syncing');
  await outbox.transition(arrive.id, 'conflict', { failureReason: 'TRIP_CLOSED' });
  const trip = await store.update('T1', (current) => ({ ...current, stops: current.stops.map((stop) => ({ ...stop, status: 'on_site', arrivedAt: '2026-10-12T11:55:00Z', pending: true })) }));
  const conflict = await resolver.registerFieldConflict({
    organizationId: 'tenant-a', outboxItemId: arrive.id, tripId: 'T1', reasonCode: 'TRIP_CLOSED', summary: summarizeConflict({ ...arrive, status: 'conflict' }, trip), remote: { from: 'in_progress' },
  });
  return { database, outbox, resolver, store, service, call, arrive, deliver, conflict };
}

// Spec 010, T041 (RF-013, RF-026, RN-002): só quem está com o aparelho de origem decide; descartar e reenviar passam pelo servidor ANTES de mudar a fila;
// nada some sem decisão registrada.
describe('ConflictService.list', () => {
  it('lista os conflitos abertos com o item da fila, o motivo em texto e o resumo, sem dado sensível', async () => {
    const s = await setup();
    const views = await s.service.list();
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ conflictId: s.conflict.id, itemId: s.arrive.id, tripId: 'T1', reasonCode: 'TRIP_CLOSED', reasonText: 'A viagem foi encerrada depois que você registrou isto.' });
    expect(views[0]!.summary).toMatchObject({ operation: 'trip.arrive_stop', stopPosition: 1, positionInformed: true });
    expect(JSON.stringify(views)).not.toMatch(/-23\.55|Sigiloso|gps/);
    await s.database.close();
  });

  it('não lista o que já foi resolvido', async () => {
    const s = await setup();
    await s.resolver.closeFieldConflict(s.conflict.id, 'discard_local');
    expect(await s.service.list()).toEqual([]);
    await s.database.close();
  });
});

describe('descartar', () => {
  it('chama o servidor com a decisão e a justificativa, e só depois remove o item e fecha o conflito', async () => {
    const s = await setup();
    expect(await s.service.discard(s.conflict.id, '  Viagem   cancelada pelo gestor  ')).toEqual({ ok: true });
    expect(s.call).toHaveBeenCalledWith('manage-trips', {
      operation: 'resolve_sync_conflict', organization_id: 'tenant-a', request_id: 'b0000000-0000-4000-8000-000000000001', trip_id: 'T1', source_request_id: s.arrive.idempotency_key,
      decision: 'discard', justification: 'Viagem cancelada pelo gestor',
    });
    expect((await s.outbox.list()).some((item) => item.id === s.arrive.id)).toBe(false);
    expect((await s.resolver.list()).find((entry) => entry.id === s.conflict.id)).toMatchObject({ status: 'resolved', decision: 'discard_local' });
    await s.database.close();
  });

  it('o dependente do item descartado vira conflito (a pessoa decide), nunca é enviado sozinho', async () => {
    const s = await setup();
    await s.service.discard(s.conflict.id, 'Viagem cancelada pelo gestor');
    const remaining = await s.outbox.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: s.deliver.id, status: 'conflict', failure_reason: 'MISSING_DEPENDENCY' });
    const open = await s.service.list();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ itemId: s.deliver.id, reasonText: 'Depende de um registro que foi descartado.' });
    expect(open[0]!.summary).toMatchObject({ operation: 'trip.deliver', recipientInformed: true });
    expect(JSON.stringify(await s.resolver.list())).not.toContain('Sigiloso');
    await s.database.close();
  });

  it('desfaz na cópia guardada o que a tela mostrava como pendente', async () => {
    const s = await setup();
    await s.service.discard(s.conflict.id, 'Viagem cancelada pelo gestor');
    const trip = await s.store.get('T1');
    expect(trip?.stops[0]).toMatchObject({ status: 'pending', arrivedAt: null });
    expect(trip?.stops[0]!.pending).toBeUndefined();
    await s.database.close();
  });

  it('sem conexão, não descarta nada (a decisão precisa ser auditada no servidor antes)', async () => {
    const s = await setup({ online: false });
    expect(await s.service.discard(s.conflict.id, 'Viagem cancelada pelo gestor')).toEqual({ ok: false, reason: 'offline' });
    expect(s.call).not.toHaveBeenCalled();
    expect((await s.outbox.list()).some((item) => item.id === s.arrive.id)).toBe(true);
    await s.database.close();
  });

  it('sem permissão de operar viagens, recusa sem chamar o servidor', async () => {
    const s = await setup({ canOperate: false });
    expect(await s.service.discard(s.conflict.id, 'Viagem cancelada pelo gestor')).toEqual({ ok: false, reason: 'forbidden' });
    expect(s.call).not.toHaveBeenCalled();
    await s.database.close();
  });

  it.each(['', '   ', 'abc', ' a b ', 'x'.repeat(501)])('justificativa inválida (%j): recusa antes de chamar o servidor', async (justification) => {
    const s = await setup();
    expect(await s.service.discard(s.conflict.id, justification)).toEqual({ ok: false, reason: 'invalid_justification' });
    expect(s.call).not.toHaveBeenCalled();
    await s.database.close();
  });

  it('conflito que não existe: não encontrado', async () => {
    const s = await setup();
    expect(await s.service.discard('inexistente', 'Viagem cancelada pelo gestor')).toEqual({ ok: false, reason: 'not_found' });
    await s.database.close();
  });

  it.each([
    [{ status: 401, body: { code: 'AUTH_REQUIRED' } }, 'session_expired'],
    [{ status: 403, body: { code: 'ACCESS_DENIED' } }, 'forbidden'],
    [{ status: 404, body: { code: 'NOT_FOUND' } }, 'not_found'],
    [{ status: 400, body: { code: 'VALIDATION_FAILED' } }, 'invalid_justification'],
    [{ status: 500, body: {} }, 'unavailable'],
    [new Error('rede'), 'unavailable'],
  ] as const)('o servidor recusa (%j): o item NÃO sai do aparelho', async (response, reason) => {
    const s = await setup({ response: response as never });
    expect(await s.service.discard(s.conflict.id, 'Viagem cancelada pelo gestor')).toEqual({ ok: false, reason });
    expect((await s.outbox.list()).some((item) => item.id === s.arrive.id)).toBe(true);
    expect((await s.resolver.list()).find((entry) => entry.id === s.conflict.id)).toMatchObject({ status: 'open' });
    await s.database.close();
  });

  it('o servidor já tinha o descarte (a resposta se perdeu antes): conta como feito e limpa o aparelho', async () => {
    const s = await setup({ response: { status: 409, body: { code: 'ALREADY_RESOLVED' } } });
    expect(await s.service.discard(s.conflict.id, 'Viagem cancelada pelo gestor')).toEqual({ ok: true });
    expect((await s.outbox.list()).some((item) => item.id === s.arrive.id)).toBe(false);
    await s.database.close();
  });
});

describe('reenviar', () => {
  it('registra a decisão no servidor e devolve o item a pendente com a mesma chave de idempotência', async () => {
    const s = await setup();
    expect(await s.service.resubmit(s.conflict.id)).toEqual({ ok: true });
    expect(s.call).toHaveBeenCalledWith('manage-trips', expect.objectContaining({ operation: 'resolve_sync_conflict', decision: 'resubmit', source_request_id: s.arrive.idempotency_key }));
    expect((s.call.mock.calls[0] as unknown[])[1]).not.toHaveProperty('justification');
    const item = (await s.outbox.list()).find((entry) => entry.id === s.arrive.id)!;
    expect(item).toMatchObject({ status: 'pending', idempotency_key: s.arrive.idempotency_key, failure_reason: null });
    expect((await s.resolver.list()).find((entry) => entry.id === s.conflict.id)).toMatchObject({ status: 'resolved', decision: 'keep_local' });
    await s.database.close();
  });

  it('sem conexão, sem permissão ou com o servidor recusando, o item continua em conflito', async () => {
    for (const options of [{ online: false }, { canOperate: false }, { response: { status: 500, body: {} } }] as const) {
      const s = await setup(options as never);
      const result = await s.service.resubmit(s.conflict.id);
      expect(result.ok).toBe(false);
      expect((await s.outbox.list()).find((entry) => entry.id === s.arrive.id)).toMatchObject({ status: 'conflict' });
      await s.database.close();
    }
  });

  it('reenviar um conflito já descartado no servidor limpa o aparelho (a decisão que vale é a do servidor)', async () => {
    const s = await setup({ response: { status: 409, body: { code: 'ALREADY_RESOLVED' } } });
    expect(await s.service.resubmit(s.conflict.id)).toEqual({ ok: false, reason: 'already_resolved' });
    expect((await s.outbox.list()).some((item) => item.id === s.arrive.id)).toBe(false);
    expect((await s.resolver.list()).find((entry) => entry.id === s.conflict.id)).toMatchObject({ status: 'resolved', decision: 'discard_local' });
    await s.database.close();
  });
});
