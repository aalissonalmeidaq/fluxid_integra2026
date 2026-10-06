import { describe, expect, it } from 'vitest';
import { identifierKey, isValidIdentifierValue, normalizeIdentifier } from './identifier';

describe('normalizeIdentifier', () => {
  it('remove espaços nas pontas', () => {
    expect(normalizeIdentifier('  QR-123  ')).toBe('QR-123');
  });

  it('remove quebras de linha de leitor tipo teclado (Enter no fim ou no começo)', () => {
    expect(normalizeIdentifier('QR-123\n')).toBe('QR-123');
    expect(normalizeIdentifier('\r\nQR-123\r\n')).toBe('QR-123');
    expect(normalizeIdentifier('QR-\n123')).toBe('QR-123');
  });

  it('preserva a caixa e o miolo do valor', () => {
    expect(normalizeIdentifier('Qr 12-a')).toBe('Qr 12-a');
  });

  it('devolve texto vazio quando só há espaços e quebras', () => {
    expect(normalizeIdentifier(' \n \r\n ')).toBe('');
  });
});

describe('identifierKey', () => {
  it('ignora diferença de caixa e espaços nas pontas, como o servidor (RF-012)', () => {
    expect(identifierKey('  qr-abc ')).toBe('QR-ABC');
    expect(identifierKey('QR-ABC')).toBe(identifierKey('qr-abc'));
  });
});

describe('isValidIdentifierValue', () => {
  it('aceita de 1 a 200 caracteres', () => {
    expect(isValidIdentifierValue('A')).toBe(true);
    expect(isValidIdentifierValue('A'.repeat(200))).toBe(true);
  });

  it('recusa vazio e acima de 200 caracteres', () => {
    expect(isValidIdentifierValue('')).toBe(false);
    expect(isValidIdentifierValue('   ')).toBe(false);
    expect(isValidIdentifierValue('A'.repeat(201))).toBe(false);
  });
});
