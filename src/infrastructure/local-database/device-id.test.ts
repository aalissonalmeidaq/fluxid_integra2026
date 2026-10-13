import { describe, expect, it } from 'vitest';
import { getDeviceId } from './device-id';

const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { getItem: (key: string) => data[key] ?? null, setItem: (key: string, value: string) => { data[key] = value; }, data };
};

describe('identificador do aparelho', () => {
  it('gera um UUID, guarda e devolve o mesmo nas próximas vezes', () => {
    const storage = memory();
    const first = getDeviceId(storage);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.data['fluxid-device-id']).toBe(first);
    expect(getDeviceId(storage)).toBe(first);
  });

  it('valor guardado que não é UUID é trocado', () => {
    const storage = memory({ 'fluxid-device-id': 'qualquer coisa' });
    expect(getDeviceId(storage)).not.toBe('qualquer coisa');
  });

  it('sem armazenamento (ou com erro) ainda devolve um identificador estável na sessão', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(getDeviceId(broken)).toBe(getDeviceId(broken));
    expect(getDeviceId(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
