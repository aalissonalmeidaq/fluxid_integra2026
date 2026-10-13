import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildOfflineAccess, restoreOfflineAccess } from '@/domain/identity/offline-access';
import { OfflineAccessStore } from './offline-access-store';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  })));
});

let clock = new Date('2026-10-12T10:00:00Z');
const store = () => {
  const name = `access-${crypto.randomUUID()}`;
  names.push(name);
  clock = new Date('2026-10-12T10:00:00Z');
  return new OfflineAccessStore(name, () => clock);
};
const record = (over: Partial<Parameters<typeof buildOfflineAccess>[0]> = {}) => buildOfflineAccess({
  actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A', organizationKind: 'tenant', endpointId: 'local', aal: 'aal1', displayName: 'Administrador A', permissions: ['trip.operate'], confirmedAt: clock, ...over,
});

// Spec 010, T084 (RF-016; research.md §19a): base própria e pequena, lida sem desbloquear nenhum tenant; grava no máximo uma vez por minuto; apaga no fim da sessão.
describe('OfflineAccessStore', () => {
  it('sem registro, a leitura devolve nulo', async () => {
    expect(await store().read()).toBeNull();
  });

  it('grava e lê o registro, sem precisar desbloquear nada', async () => {
    const s = store();
    expect(await s.save(record())).toBe(true);
    expect(await s.read()).toEqual(record());
  });

  it('o que foi gravado restaura o acesso dentro das 8 horas', async () => {
    const s = store();
    await s.save(record());
    expect(restoreOfflineAccess(await s.read(), new Date('2026-10-12T17:00:00Z')).ok).toBe(true);
    expect(restoreOfflineAccess(await s.read(), new Date('2026-10-12T18:00:00Z')).ok).toBe(false);
  });

  it('não regrava na mesma conta e permissões antes de um minuto', async () => {
    const s = store();
    await s.save(record());
    clock = new Date('2026-10-12T10:00:30Z');
    expect(await s.save(record({ confirmedAt: clock }))).toBe(false);
    expect((await s.read() as { confirmedAt: string }).confirmedAt).toBe('2026-10-12T10:00:00.000Z');
    clock = new Date('2026-10-12T10:01:00Z');
    expect(await s.save(record({ confirmedAt: clock }))).toBe(true);
    expect((await s.read() as { confirmedAt: string }).confirmedAt).toBe('2026-10-12T10:01:00.000Z');
  });

  it('regrava na hora quando a conta, a organização, o destino ou as permissões mudam', async () => {
    const s = store();
    await s.save(record());
    expect(await s.save(record({ permissions: ['trip.operate', 'trip.read'] }))).toBe(true);
    expect(await s.save(record({ permissions: ['trip.operate', 'trip.read'], organizationId: 'tenant-b' }))).toBe(true);
    expect(await s.save(record({ permissions: ['trip.operate', 'trip.read'], organizationId: 'tenant-b', actorId: 'user-2' }))).toBe(true);
  });

  it('apagar remove o registro (logout, expiração e revogação)', async () => {
    const s = store();
    await s.save(record());
    await s.clear();
    expect(await s.read()).toBeNull();
    expect(await s.save(record())).toBe(true);
  });

  it('um registro novo substitui o anterior (só existe um acesso por aparelho)', async () => {
    const s = store();
    await s.save(record());
    await s.save(record({ actorId: 'user-2' }));
    expect((await s.read() as { actorId: string }).actorId).toBe('user-2');
  });

  it('nunca guarda token nem nada fora do registro', async () => {
    const s = store();
    await s.save({ ...record(), access_token: 'jwt-secreto', email: 'a@example.invalid' } as never);
    const raw = JSON.stringify(await s.read());
    expect(raw).not.toMatch(/jwt-secreto|example\.invalid|access_token/);
  });

  it('leitura com base indisponível devolve nulo em vez de quebrar a abertura', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error simula navegador sem IndexedDB
    globalThis.indexedDB = undefined;
    try {
      expect(await new OfflineAccessStore().read()).toBeNull();
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
