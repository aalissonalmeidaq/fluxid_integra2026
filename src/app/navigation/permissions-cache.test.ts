import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPermissionsCache } from './permissions-cache';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';
const PERMISSIONS = { tenant: ['audit.read'], global: ['platform.manage'] };

beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

describe('cache offline das permissões (RF-017, RF-020)', () => {
  it('grava { codes, savedAt } na chave fluxid.menu.* sem identificador em claro', () => {
    createPermissionsCache().write('user-123', A, PERMISSIONS);
    expect(sessionStorage.length).toBe(1);
    const key = sessionStorage.key(0) ?? '';
    expect(key.startsWith('fluxid.menu.')).toBe(true);
    expect(key).not.toContain('user-123');
    expect(key).not.toContain(A);
    const stored = JSON.parse(sessionStorage.getItem(key) ?? '{}') as { codes: unknown; savedAt: string };
    expect(stored.codes).toEqual(PERMISSIONS);
    expect(Number.isNaN(Date.parse(stored.savedAt))).toBe(false);
  });

  it('lê só da mesma pessoa e do mesmo tenant', () => {
    const cache = createPermissionsCache();
    cache.write('user-1', A, PERMISSIONS);
    expect(cache.read('user-1', A)?.codes).toEqual(PERMISSIONS);
    expect(cache.read('user-1', B)).toBeNull();
    expect(cache.read('user-2', A)).toBeNull();
    expect(cache.read('user-1', null)).toBeNull();
  });

  it('o cache sem tenant ativo é separado do cache com tenant', () => {
    const cache = createPermissionsCache();
    cache.write('user-1', null, { tenant: [], global: ['platform.manage'] });
    expect(cache.read('user-1', null)?.codes.global).toEqual(['platform.manage']);
    expect(cache.read('user-1', A)).toBeNull();
  });

  it('remove tudo no logout e na expiração', () => {
    const cache = createPermissionsCache();
    cache.write('user-1', A, PERMISSIONS);
    cache.write('user-1', B, PERMISSIONS);
    sessionStorage.setItem('outra.chave', 'fica');
    cache.clear();
    expect(cache.read('user-1', A)).toBeNull();
    expect(cache.read('user-1', B)).toBeNull();
    expect(sessionStorage.getItem('outra.chave')).toBe('fica');
  });

  it('na troca de pessoa remove o que pertence a outras pessoas e mantém o da atual', () => {
    const cache = createPermissionsCache();
    cache.write('user-1', A, PERMISSIONS);
    cache.write('user-2', A, PERMISSIONS);
    cache.clearOthers('user-2');
    expect(cache.read('user-1', A)).toBeNull();
    expect(cache.read('user-2', A)?.codes).toEqual(PERMISSIONS);
  });

  it('tolera conteúdo corrompido ou com formato errado, sem lançar', () => {
    const cache = createPermissionsCache();
    cache.write('user-1', A, PERMISSIONS);
    const key = sessionStorage.key(0) ?? '';
    sessionStorage.setItem(key, '{não é json');
    expect(cache.read('user-1', A)).toBeNull();
    sessionStorage.setItem(key, JSON.stringify({ codes: { tenant: 'x', global: [] }, savedAt: 'hoje' }));
    expect(cache.read('user-1', A)).toBeNull();
    sessionStorage.setItem(key, JSON.stringify({ codes: { tenant: [1], global: [] }, savedAt: '2026-10-01T10:00:00Z' }));
    expect(cache.read('user-1', A)).toBeNull();
  });

  it('tolera sessionStorage indisponível', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('bloqueado'); });
    const cache = createPermissionsCache();
    expect(() => cache.write('user-1', A, PERMISSIONS)).not.toThrow();
    expect(cache.read('user-1', A)).toBeNull();
    expect(() => cache.clear()).not.toThrow();
    expect(() => cache.clearOthers('user-1')).not.toThrow();
  });
});
