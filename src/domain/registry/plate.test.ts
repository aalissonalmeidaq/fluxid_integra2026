import { describe, expect, it } from 'vitest';
import { formatPlate, normalizePlate, validatePlate } from './plate';

// Mesma tabela de casos de supabase/tests/007_validators.test.sql (CA-008).
describe('normalizePlate (padrões AAA9999 e AAA9A99)', () => {
  it.each([
    ['placa antiga com hífen e minúsculas', 'abc-1234', 'ABC1234'],
    ['placa Mercosul', 'ABC1D23', 'ABC1D23'],
    ['espaços são removidos', ' abc 1d23 ', 'ABC1D23'],
    ['formato AB12345', 'AB12345', null],
    ['formato ABCD123', 'ABCD123', null],
    ['placa curta', 'ABC123', null],
    ['vazia', '', null],
  ] as const)('%s', (_nome, entrada, esperado) => {
    expect(normalizePlate(entrada)).toBe(esperado);
  });
});

describe('validatePlate', () => {
  it('aceita os dois padrões e recusa o resto', () => {
    expect(validatePlate('ABC1234')).toBe(true);
    expect(validatePlate('abc1d23')).toBe(true);
    expect(validatePlate('AB12345')).toBe(false);
  });
});

describe('formatPlate (exibição)', () => {
  it('mostra a placa antiga com hífen e a Mercosul sem', () => {
    expect(formatPlate('ABC1234')).toBe('ABC-1234');
    expect(formatPlate('ABC1D23')).toBe('ABC1D23');
  });

  it('valor inválido volta em maiúsculas, sem inventar formato', () => {
    expect(formatPlate('xyz')).toBe('XYZ');
  });
});
