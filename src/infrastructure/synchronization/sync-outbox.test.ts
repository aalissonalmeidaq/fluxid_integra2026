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

  // Spec 010, T011: partição por conta e destino, e nada sensível sobrevive à confirmação nem ao descarte (RF-002, RF-016, RF-025).
  describe('fila de campo (Spec 010)', () => {
    const owner = { actorId: 'actor-1', endpointId: 'local' };
    const field = { ...command, operation: 'trip.check_item', endpointId: 'local', tripId: 'trip-1', payload: { item_id: 'I1', latitude: -23.55, recipient_name: 'Recebedor Fictício' } };

    it('guarda o destino de origem, a viagem e a hora da fila', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(field);
      expect(item).toMatchObject({ endpoint_id: 'local', trip_id: 'trip-1', queued_at: '2026-09-29T12:00:00.000Z' });
      await database.close();
    });

    it('sem destino nem viagem, mantém o comportamento da Spec 002', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(command);
      expect(item).toMatchObject({ endpoint_id: null, trip_id: null });
      await database.close();
    });

    it('listOwned devolve só os itens da conta e do destino', async () => {
      const { database, outbox } = await setup();
      const mine = await outbox.enqueue(field);
      await outbox.enqueue({ ...field, actorId: 'actor-2' });
      await outbox.enqueue({ ...field, endpointId: 'cloud' });
      expect((await outbox.listOwned(owner)).map((item) => item.id)).toEqual([mine.id]);
      await database.close();
    });

    it('confirmar remove o item por inteiro: nenhum payload sobrevive', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(field);
      await outbox.transition(item.id, 'syncing');
      await outbox.confirm(item.id, '2026-09-29T12:01:00Z');
      expect(await outbox.list()).toEqual([]);
      expect(await database.list('local_outbox')).toEqual([]);
      await database.close();
    });

    it('confirmar exige o item em envio e a hora do servidor', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(field);
      await expect(outbox.confirm(item.id, '2026-09-29T12:01:00Z')).rejects.toThrow(/transição/i);
      await outbox.transition(item.id, 'syncing');
      await expect(outbox.confirm(item.id, '')).rejects.toThrow(/confirmação/i);
      expect(await outbox.list()).toHaveLength(1);
      await database.close();
    });

    it('descartar com decisão remove o item por inteiro e audita; sem autorização não remove nada', async () => {
      const { database, outbox, audit } = await setup();
      const item = await outbox.enqueue(field);
      await outbox.transition(item.id, 'syncing');
      await outbox.transition(item.id, 'conflict');
      await expect(outbox.discardAndRemove(item.id, { authorized: false, actorId: 'actor-1' })).rejects.toThrow(/autorização/i);
      expect(await outbox.list()).toHaveLength(1);
      await outbox.discardAndRemove(item.id, { authorized: true, actorId: 'actor-1' });
      expect(await outbox.list()).toEqual([]);
      expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'outbox.discard', itemId: item.id }));
      await database.close();
    });

    it('descartar só vale para conflito ou falha (nunca para o que está pendente ou enviando)', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(field);
      await expect(outbox.discardAndRemove(item.id, { authorized: true, actorId: 'actor-1' })).rejects.toThrow(/conflito|falha/i);
      expect(await outbox.list()).toHaveLength(1);
      await database.close();
    });

    it('reenviar devolve o conflito a pendente com a mesma chave de idempotência', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(field);
      await outbox.transition(item.id, 'syncing');
      await outbox.transition(item.id, 'conflict');
      const again = await outbox.resubmit(item.id);
      expect(again).toMatchObject({ status: 'pending', idempotency_key: item.idempotency_key, failure_reason: null });
      await database.close();
    });

    it('reenviar só vale para conflito ou falha', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(field);
      await expect(outbox.resubmit(item.id)).rejects.toThrow(/conflito|falha/i);
      await database.close();
    });

    it('cancelar um pendente que nunca foi enviado remove o item sem evento no servidor', async () => {
      const { database, outbox } = await setup();
      const item = await outbox.enqueue(field);
      await outbox.cancelPending(item.id);
      expect(await outbox.list()).toEqual([]);
      await database.close();
    });

    it('cancelar só vale para pendente (nunca para o que está sendo enviado, em conflito ou já tentado)', async () => {
      const { database, outbox } = await setup();
      const sending = await outbox.enqueue(field);
      await outbox.transition(sending.id, 'syncing');
      await expect(outbox.cancelPending(sending.id)).rejects.toThrow(/pendente/i);
      const tried = await outbox.enqueue(field);
      await outbox.transition(tried.id, 'syncing');
      await outbox.registerFailure(tried.id, 'network');
      await expect(outbox.cancelPending(tried.id)).rejects.toThrow(/enviado|tentativa/i);
      expect(await outbox.list()).toHaveLength(2);
      await database.close();
    });
  });
});
