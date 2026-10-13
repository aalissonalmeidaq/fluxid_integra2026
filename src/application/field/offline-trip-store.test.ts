import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { applyChecked } from '@/domain/field/offline-trip';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { OfflineTripStore } from './offline-trip-store';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

async function setup(owner = { actorId: 'user-1', endpointId: 'local', organizationId: 'tenant-a' }) {
  const name = `trips-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LocalDatabase(name);
  await database.open();
  database.unlock(owner.organizationId);
  return { database, store: new OfflineTripStore(database, owner, () => new Date('2026-10-12T12:00:00Z')) };
}

const raw = (over: Record<string, unknown> = {}) => ({
  code: 'OK',
  fetched_at: '2026-10-12T11:59:00Z',
  trip: { id: 'T1', number: 7, planned_date: '2026-10-12', status: 'loading', version: 3, ...over },
  vehicle: { plate: 'OFT1001' },
  stops: [{ id: 'S1', position: 1, status: 'pending', arrived_at: null, site: { id: 'U1', name: 'Unidade 1', city: 'São Paulo', state: 'SP', customer_name: 'Hospital Alfa' } }],
  items: [{ id: 'I1', stop_id: 'S1', item_status: 'planned', lock_status: 'none', cylinder: { id: 'C1', serial_number: 'OFT-001', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l' }, identifiers: ['QR-OFT-001'] }],
  deliveries: [],
  // Nada disto pode ser guardado (RF-006, RF-025):
  driver: { full_name: 'Motorista Sigiloso' },
});

// RF-006, RF-007, data-model.md §2.3: a viagem guardada para operar offline, por conta, organização e destino, sem nenhum dado sensível.
describe('OfflineTripStore', () => {
  it('guarda a viagem aberta com conexão e a devolve igual', async () => {
    const { database, store } = await setup();
    const saved = await store.save(raw());
    expect(saved).toMatchObject({ id: 'T1', status: 'loading' });
    expect(await store.get('T1')).toEqual(saved);
    expect((await store.list()).map((trip) => trip.id)).toEqual(['T1']);
    await database.close();
  });

  it('atualiza a cópia a cada abertura online', async () => {
    const { database, store } = await setup();
    await store.save(raw());
    await store.save(raw({ version: 4 }));
    expect((await store.get('T1'))?.version).toBe(4);
    expect(await store.list()).toHaveLength(1);
    await database.close();
  });

  it('não guarda corpo inválido nem viagem que não serve para operar offline', async () => {
    const { database, store } = await setup();
    expect(await store.save({ code: 'NOT_FOUND' })).toBeNull();
    expect(await store.save(raw({ status: 'planned' }))).toBeNull();
    expect(await store.save(raw({ status: 'completed' }))).toBeNull();
    expect(await store.list()).toEqual([]);
    await database.close();
  });

  it('nunca guarda motorista, recebedor, coordenadas, fotos nem assinatura', async () => {
    const { database, store } = await setup();
    await store.save(raw());
    const records = await database.list('local_trips');
    expect(JSON.stringify(records)).not.toMatch(/Motorista Sigiloso|recipient|latitude|longitude|signature|photo/i);
    await database.close();
  });

  it('a cópia é só da conta, da organização e do destino de quem abriu', async () => {
    const { database, store } = await setup();
    await store.save(raw());
    const outraConta = new OfflineTripStore(database, { actorId: 'user-2', endpointId: 'local', organizationId: 'tenant-a' });
    const outroDestino = new OfflineTripStore(database, { actorId: 'user-1', endpointId: 'cloud', organizationId: 'tenant-a' });
    expect(await outraConta.get('T1')).toBeNull();
    expect(await outroDestino.list()).toEqual([]);
    database.unlock('tenant-b');
    const outraOrganizacao = new OfflineTripStore(database, { actorId: 'user-1', endpointId: 'local', organizationId: 'tenant-b' });
    expect(await outraOrganizacao.get('T1')).toBeNull();
    await database.close();
  });

  it('duas contas no mesmo aparelho guardam cada uma a sua cópia da mesma viagem', async () => {
    const { database, store } = await setup();
    const other = new OfflineTripStore(database, { actorId: 'user-2', endpointId: 'local', organizationId: 'tenant-a' });
    await store.save(raw());
    await other.save(raw({ version: 9 }));
    expect((await store.get('T1'))?.version).toBe(3);
    expect((await other.get('T1'))?.version).toBe(9);
    await database.close();
  });

  it('recusa trabalhar com a organização do dono diferente da base desbloqueada', async () => {
    const { database } = await setup();
    const wrong = new OfflineTripStore(database, { actorId: 'user-1', endpointId: 'local', organizationId: 'tenant-b' });
    await expect(wrong.save(raw())).rejects.toThrow(/tenant|organiza/i);
    await database.close();
  });

  it('persiste as mudanças otimistas (pendente) e as devolve na próxima leitura', async () => {
    const { database, store } = await setup();
    await store.save(raw());
    const updated = await store.update('T1', (trip) => applyChecked(trip, 'I1'));
    expect(updated?.items[0]).toMatchObject({ itemStatus: 'checked', pending: true });
    expect((await store.get('T1'))?.items[0]).toMatchObject({ itemStatus: 'checked', pending: true });
    await database.close();
  });

  it('update de viagem que não existe não cria nada', async () => {
    const { database, store } = await setup();
    expect(await store.update('XX', (trip) => trip)).toBeNull();
    expect(await store.list()).toEqual([]);
    await database.close();
  });

  it('abrir de novo com conexão não perde o que ainda está pendente na fila', async () => {
    const { database, store } = await setup();
    await store.save(raw());
    await store.update('T1', (trip) => applyChecked(trip, 'I1'));
    const refreshed = await store.save(raw(), { pendingItemIds: new Set(['I1']) });
    expect(refreshed?.items[0]).toMatchObject({ itemStatus: 'checked', pending: true });
    await database.close();
  });

  it('remove uma viagem e remove tudo do dono, sem tocar na de outro', async () => {
    const { database, store } = await setup();
    const other = new OfflineTripStore(database, { actorId: 'user-2', endpointId: 'local', organizationId: 'tenant-a' });
    await store.save(raw());
    await other.save(raw());
    await store.remove('T1');
    expect(await store.get('T1')).toBeNull();
    expect(await other.get('T1')).not.toBeNull();
    await store.save(raw());
    await store.removeAll();
    expect(await store.list()).toEqual([]);
    expect(await other.list()).toHaveLength(1);
    await database.close();
  });

  it('removeIfClosed só apaga a cópia sem pendência', async () => {
    const { database, store } = await setup();
    await store.save(raw());
    expect(await store.removeIfClosed('T1', true)).toBe(false);
    expect(await store.get('T1')).not.toBeNull();
    expect(await store.removeIfClosed('T1', false)).toBe(true);
    expect(await store.get('T1')).toBeNull();
    await database.close();
  });
});
