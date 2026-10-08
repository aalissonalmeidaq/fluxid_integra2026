import { describe, expect, it } from 'vitest';
import { formatPhone, formatPostalCode, normalizePhone, normalizePostalCode } from './phone-and-postal-code';

describe('normalizePhone (telefone brasileiro: DDD + 8 ou 9 dígitos)', () => {
  it.each([
    ['celular com máscara', '(11) 91234-5678', '11912345678'],
    ['fixo com máscara', '(11) 3123-4567', '1131234567'],
    ['só dígitos', '11912345678', '11912345678'],
    ['com espaços', ' 11 3123 4567 ', '1131234567'],
    ['9 dígitos', '912345678', null],
    ['12 dígitos', '119123456789', null],
    ['vazio', '', null],
  ] as const)('%s', (_nome, entrada, esperado) => {
    expect(normalizePhone(entrada)).toBe(esperado);
  });

  it('formatPhone mostra DDD e hífen', () => {
    expect(formatPhone('11912345678')).toBe('(11) 91234-5678');
    expect(formatPhone('1131234567')).toBe('(11) 3123-4567');
    expect(formatPhone('123')).toBe('123');
  });
});

describe('normalizePostalCode (CEP de 8 dígitos)', () => {
  it.each([
    ['com hífen', '01001-000', '01001000'],
    ['só dígitos', '01001000', '01001000'],
    ['com espaços', ' 01001 000 ', '01001000'],
    ['7 dígitos', '0100100', null],
    ['9 dígitos', '010010000', null],
    ['com letras', '01001-0A0', null],
    ['vazio', '', null],
  ] as const)('%s', (_nome, entrada, esperado) => {
    expect(normalizePostalCode(entrada)).toBe(esperado);
  });

  it('formatPostalCode mostra o hífen', () => {
    expect(formatPostalCode('01001000')).toBe('01001-000');
    expect(formatPostalCode('123')).toBe('123');
  });
});
