import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { QueueOwner } from '@/application/tracking/tracking-ports';
import { IndexedDbTrackingQueue, TRACKING_QUEUE_CAPACITY } from './tracking-queue';

// Spec 015 (T034; RF-007d, RF-007h, CS-014, CS-016): fila de posições do celular no aparelho. Cada item tem dono imutável (conta,
// empresa, destino, viagem e sessão), UUID e sequência monotônica; sai só quando o servidor confirma; comporta ao menos 480 posições
// (8 horas a uma por minuto) e nunca guarda token.
const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});
function queue() {
  const name = `fluxid-tracking-test-${crypto.randomUUID()}`;
  names.push(name);
  return new IndexedDbTrackingQueue(name);
}

const OWNER: QueueOwner = { userId: 'u1', organizationId: 'org-a', endpointId: 'cloud', tripId: 't1', trackingSessionId: 's1' };
const OTHER_TENANT: QueueOwner = { ...OWNER, organizationId: 'org-b' };
const OTHER_ENDPOINT: QueueOwner = { ...OWNER, endpointId: 'lan' };
const position = (minute: number) => ({
  observedAt: new Date(Date.UTC(2026, 9, 22, 12, minute)).toISOString(), latitude: -7.23, longitude: -39.31, accuracyM: 12,
});

describe('fila de posições do celular', () => {
  it('cada posição recebe UUID e sequência crescente por sessão', async () => {
    const q = queue();
    const a = await q.enqueue(OWNER, position(0));
    const b = await q.enqueue(OWNER, position(1));
    if (a === 'full' || b === 'full') throw new Error('cheia');
    expect(a.clientPositionId).toMatch(/^[0-9a-f-]{36}$/);
    expect([a.sequenceNo, b.sequenceNo]).toEqual([1, 2]);
    expect(a.owner).toEqual(OWNER);
  });

  it('o lote sai em ordem de sequência e só do mesmo dono', async () => {
    const q = queue();
    await q.enqueue(OWNER, position(0));
    await q.enqueue(OTHER_TENANT, position(1));
    await q.enqueue(OWNER, position(2));
    await q.enqueue(OTHER_ENDPOINT, position(3));
    const batch = await q.nextBatch(OWNER, 10);
    expect(batch.map((item) => item.sequenceNo)).toEqual([1, 2]);
    expect(batch.every((item) => item.owner.organizationId === 'org-a' && item.owner.endpointId === 'cloud')).toBe(true);
    expect(await q.count(OTHER_TENANT)).toBe(1);
  });

  it('remove só os itens confirmados; uma nova tentativa reenvia os mesmos UUIDs', async () => {
    const q = queue();
    const a = await q.enqueue(OWNER, position(0));
    const b = await q.enqueue(OWNER, position(1));
    if (a === 'full' || b === 'full') throw new Error('cheia');
    await q.remove(OWNER, [a.clientPositionId]);
    const retry = await q.nextBatch(OWNER, 10);
    expect(retry.map((item) => item.clientPositionId)).toEqual([b.clientPositionId]);
    expect(await q.count(OWNER)).toBe(1);
  });

  it('remover em nome de outro dono não apaga nada', async () => {
    const q = queue();
    const a = await q.enqueue(OWNER, position(0));
    if (a === 'full') throw new Error('cheia');
    await q.remove(OTHER_TENANT, [a.clientPositionId]);
    expect(await q.count(OWNER)).toBe(1);
  });

  it('comporta ao menos 480 posições (8 horas a uma por minuto) e recusa acima da capacidade sem perder as anteriores', async () => {
    expect(TRACKING_QUEUE_CAPACITY).toBeGreaterThanOrEqual(480);
    const q = queue();
    for (let i = 0; i < TRACKING_QUEUE_CAPACITY; i += 1) expect(await q.enqueue(OWNER, position(i % 60))).not.toBe('full');
    expect(await q.enqueue(OWNER, position(0))).toBe('full');
    expect(await q.count(OWNER)).toBe(TRACKING_QUEUE_CAPACITY);
    expect((await q.nextBatch(OWNER, 100)).at(0)?.sequenceNo).toBe(1);
  }, 30_000);

  it('a sequência continua depois de reabrir o banco', async () => {
    const name = `fluxid-tracking-test-${crypto.randomUUID()}`;
    names.push(name);
    const first = new IndexedDbTrackingQueue(name);
    await first.enqueue(OWNER, position(0));
    await first.close();
    const second = new IndexedDbTrackingQueue(name);
    const next = await second.enqueue(OWNER, position(1));
    if (next === 'full') throw new Error('cheia');
    expect(next.sequenceNo).toBe(2);
    expect(await second.count(OWNER)).toBe(2);
  });

  it('lista os donos com pendências, para avisar sem revelar coordenadas', async () => {
    const q = queue();
    await q.enqueue(OWNER, position(0));
    await q.enqueue(OTHER_TENANT, position(1));
    expect((await q.owners()).map((owner) => owner.organizationId).sort()).toEqual(['org-a', 'org-b']);
  });

  it('nada de token ou chave é guardado no item', async () => {
    const q = queue();
    const item = await q.enqueue(OWNER, position(0));
    expect(JSON.stringify(item)).not.toMatch(/token|apikey|authorization|secret/i);
  });
});
