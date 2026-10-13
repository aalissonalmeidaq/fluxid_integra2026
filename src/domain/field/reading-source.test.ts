// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isReadingSource, READING_SOURCES, READING_SOURCE_LABELS, readingSourceSentence, sourceOfCandidate } from './reading-source';

// RF-001, RN-002: quatro métodos de conferência, na mesma ordem e com os mesmos valores da restrição do banco.
describe('métodos de leitura', () => {
  it('são quatro: toque (manual), código digitado ou leitor, câmera e NFC', () => {
    expect([...READING_SOURCES]).toEqual(['manual', 'typed', 'camera', 'nfc']);
  });

  it('cada método tem rótulo em português', () => {
    expect(READING_SOURCE_LABELS).toEqual({ manual: 'toque', typed: 'código digitado ou leitor', camera: 'câmera', nfc: 'NFC' });
  });

  it('isReadingSource só aceita os quatro valores', () => {
    expect(isReadingSource('camera')).toBe(true);
    expect(isReadingSource('scan')).toBe(false);
    expect(isReadingSource('')).toBe(false);
    expect(isReadingSource(null)).toBe(false);
  });
});

describe('readingSourceSentence', () => {
  it('monta a frase do histórico, sem nunca citar o valor lido', () => {
    expect(readingSourceSentence('conferido', 'camera')).toBe('conferido por câmera');
    expect(readingSourceSentence('entregue', 'nfc')).toBe('entregue por NFC');
    expect(readingSourceSentence('conferido', 'manual')).toBe('conferido por toque');
    expect(readingSourceSentence('conferido', 'typed')).toBe('conferido por código digitado ou leitor');
  });

  it('sem método informado, não acrescenta nada', () => {
    expect(readingSourceSentence('conferido', null)).toBe('conferido');
    expect(readingSourceSentence('conferido', undefined)).toBe('conferido');
    expect(readingSourceSentence('conferido', 'qualquer')).toBe('conferido');
  });
});

describe('sourceOfCandidate', () => {
  it('liga o modo de leitura ao método: câmera e NFC; digitação ou leitor-teclado é "typed"', () => {
    expect(sourceOfCandidate('camera')).toBe('camera');
    expect(sourceOfCandidate('nfc')).toBe('nfc');
    expect(sourceOfCandidate('keyboard')).toBe('typed');
  });
});
