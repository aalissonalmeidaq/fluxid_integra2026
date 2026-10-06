import { describe, expect, it } from 'vitest';
import { OperationKey } from './operation-key';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('OperationKey (RF-014, RF-029)', () => {
  it('gera um UUID', () => {
    expect(new OperationKey().current()).toMatch(UUID);
  });

  it('mantém a mesma chave enquanto o resultado for desconhecido (repetir o envio)', () => {
    const key = new OperationKey();
    const first = key.current();
    expect(key.current()).toBe(first);
    expect(key.current()).toBe(first);
  });

  it('gera outra chave só depois de uma resposta definitiva', () => {
    const key = new OperationKey();
    const first = key.current();
    key.settle();
    const second = key.current();
    expect(second).not.toBe(first);
    expect(second).toMatch(UUID);
  });

  it('chaves independentes não se misturam', () => {
    expect(new OperationKey().current()).not.toBe(new OperationKey().current());
  });
});
