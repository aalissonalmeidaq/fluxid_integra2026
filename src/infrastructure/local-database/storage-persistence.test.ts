import { describe, expect, it, vi } from 'vitest';
import { MAX_QUEUE_ATTACHMENT_BYTES } from '@/domain/field/attachment-limits';
import { checkStorage, NOT_PERSISTENT_MESSAGE, LOW_SPACE_MESSAGE } from './storage-persistence';

// Spec 010, T029 (RF-026; contracts/fila-local.md §7): pede armazenamento persistente e avisa em texto quando não há ou quando falta espaço.
const MB = 1024 * 1024;
const manager = (over: Record<string, unknown> = {}) => ({
  persisted: vi.fn(async () => false), persist: vi.fn(async () => true), estimate: vi.fn(async () => ({ usage: 10 * MB, quota: 1000 * MB })), ...over,
});

describe('armazenamento do aparelho', () => {
  it('pede persistência quando ainda não há e, concedida, não avisa nada', async () => {
    const storage = manager();
    const status = await checkStorage(storage);
    expect(storage.persist).toHaveBeenCalled();
    expect(status).toMatchObject({ persistent: true, warning: null, lowSpace: false });
  });

  it('já persistente: não pede de novo', async () => {
    const storage = manager({ persisted: vi.fn(async () => true) });
    expect((await checkStorage(storage)).persistent).toBe(true);
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('persistência negada: avisa em texto que o navegador pode apagar os dados', async () => {
    const status = await checkStorage(manager({ persist: vi.fn(async () => false) }));
    expect(status).toMatchObject({ persistent: false, warning: NOT_PERSISTENT_MESSAGE });
  });

  it('pouco espaço livre (menos que o limite da fila de anexos) ou 80% da cota usada avisa', async () => {
    expect((await checkStorage(manager({ persisted: vi.fn(async () => true), estimate: vi.fn(async () => ({ usage: 970 * MB, quota: 1000 * MB })) }))).lowSpace).toBe(true);
    const tight = await checkStorage(manager({ persisted: vi.fn(async () => true), estimate: vi.fn(async () => ({ usage: 0, quota: MAX_QUEUE_ATTACHMENT_BYTES - 1 })) }));
    expect(tight).toMatchObject({ lowSpace: true, warning: LOW_SPACE_MESSAGE });
  });

  it('navegador sem a API: não é persistente, sem erro', async () => {
    expect(await checkStorage(undefined)).toEqual({ persistent: false, lowSpace: false, usageBytes: null, quotaBytes: null, warning: NOT_PERSISTENT_MESSAGE });
  });

  it('falha da API não derruba nada', async () => {
    const broken = { persisted: vi.fn(async () => { throw new Error('x'); }), persist: vi.fn(async () => { throw new Error('x'); }), estimate: vi.fn(async () => { throw new Error('x'); }) };
    expect((await checkStorage(broken)).persistent).toBe(false);
  });
});
