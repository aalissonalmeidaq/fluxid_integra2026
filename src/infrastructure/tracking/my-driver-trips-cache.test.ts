import { describe, expect, it } from 'vitest';
import { createMyDriverTripsCache } from './my-driver-trips-cache';

// Spec 015 (validação humana): "Minha viagem" precisa abrir sem conexão no meio da viagem. Guarda a última resposta por pessoa e
// empresa; outra pessoa ou outra empresa nunca vê o que ficou guardado, e falha do armazenamento não quebra a tela.
function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(), key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); },
  };
}
const VIEW = { isDriver: true, trips: [{ id: 't1', number: 2, status: 'in_progress', plannedDate: '2026-10-27', startedAt: '2026-10-27T14:00:00Z',
  vehiclePlate: 'DEM1A14', stopCount: 3 }] };

describe('cache de Minha viagem', () => {
  it('devolve o que foi guardado para a mesma pessoa e empresa, com o horário', () => {
    const cache = createMyDriverTripsCache(memory());
    cache.write('u1', 'org-a', VIEW, '2026-10-27T15:00:00Z');
    expect(cache.read('u1', 'org-a')).toEqual({ view: VIEW, savedAt: '2026-10-27T15:00:00Z' });
  });

  it('outra pessoa ou outra empresa não vê o guardado', () => {
    const cache = createMyDriverTripsCache(memory());
    cache.write('u1', 'org-a', VIEW, '2026-10-27T15:00:00Z');
    expect(cache.read('u2', 'org-a')).toBeNull();
    expect(cache.read('u1', 'org-b')).toBeNull();
  });

  it('conteúdo corrompido ou armazenamento indisponível viram ausência, sem erro', () => {
    const storage = memory();
    storage.setItem('fluxid:minha-viagem:u1:org-a', '{"view":{"isDriver":"sim"}}');
    expect(createMyDriverTripsCache(storage).read('u1', 'org-a')).toBeNull();
    const broken = { ...memory(), getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } } as Storage;
    expect(() => createMyDriverTripsCache(broken).write('u1', 'org-a', VIEW, 'x')).not.toThrow();
    expect(createMyDriverTripsCache(broken).read('u1', 'org-a')).toBeNull();
    expect(createMyDriverTripsCache(null).read('u1', 'org-a')).toBeNull();
  });
});
