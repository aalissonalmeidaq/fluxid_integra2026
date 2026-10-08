import { describe, expect, it } from 'vitest';
import { normalizeCnh, normalizeCnpj, normalizeCpf, validateCnh, validateCnpj, validateCpf } from './document-validation';

// Mesma tabela de casos de supabase/tests/007_validators.test.sql (CA-008). Todos os documentos são fictícios.

describe('validateCpf (11 dígitos, já normalizado)', () => {
  it.each([
    ['CPF válido', '52998224725', true],
    ['outro CPF válido', '11144477735', true],
    ['dígito verificador errado', '52998224726', false],
    ['todos os dígitos iguais', '11111111111', false],
    ['10 dígitos', '5299822472', false],
    ['com pontuação (a normalização é do chamador)', '529.982.247-25', false],
  ] as const)('%s', (_nome, valor, esperado) => {
    expect(validateCpf(valor)).toBe(esperado);
  });

  it('normalizeCpf tira tudo o que não é dígito', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(validateCpf(normalizeCpf('529.982.247-25'))).toBe(true);
  });
});

describe('validateCnpj (numérico e alfanumérico: valor = código ASCII menos 48)', () => {
  it.each([
    ['numérico válido', '11222333000181', true],
    ['alfanumérico válido (exemplo da nota técnica)', '12ABC34501DE35', true],
    ['alfanumérico com pontuação', '12.ABC.345/01DE-35', true],
    ['alfanumérico em minúsculas', '12abc34501de35', true],
    ['dígito verificador errado', '11222333000182', false],
    ['letra nas posições 13 e 14', '12ABC34501DEAB', false],
    ['todos os caracteres iguais', '00000000000000', false],
    ['13 caracteres', '1122233300018', false],
  ] as const)('%s', (_nome, valor, esperado) => {
    expect(validateCnpj(valor)).toBe(esperado);
  });

  it('normalizeCnpj usa maiúsculas e remove ponto, barra e hífen', () => {
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('o mesmo algoritmo valida o CNPJ numérico (caso particular do alfanumérico)', () => {
    expect(validateCnpj('11.222.333/0001-81')).toBe(true);
    expect(validateCnpj('112223330001' + '81')).toBe(true);
  });
});

describe('validateCnh (11 dígitos, dois dígitos verificadores)', () => {
  it.each([
    ['CNH válida', '12345678900', true],
    ['segunda CNH válida', '98765432109', true],
    ['terceira CNH válida', '24681357982', true],
    ['dígito verificador errado', '12345678901', false],
    ['todos os dígitos iguais', '11111111111', false],
    ['10 dígitos', '1234567890', false],
  ] as const)('%s', (_nome, valor, esperado) => {
    expect(validateCnh(valor)).toBe(esperado);
  });

  it('normalizeCnh tira tudo o que não é dígito', () => {
    expect(normalizeCnh('123 456 789-00')).toBe('12345678900');
  });
});
