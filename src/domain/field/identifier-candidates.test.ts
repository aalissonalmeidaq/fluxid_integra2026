// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  candidateFromScan, candidatesFromNfc, IDENTIFIER_CANDIDATE_LIMITS, normalizeSerial, serialWithColons,
} from './identifier-candidates';

// RF-007: a etiqueta NFC vira de 1 a 3 candidatos que o servidor compara, na ordem, com os identificadores ativos da organização.
describe('normalizeSerial', () => {
  it('tira separadores e espaços e põe em maiúsculas', () => {
    expect(normalizeSerial('04:a2:3b:1c:9d:5e:80')).toBe('04A23B1C9D5E80');
    expect(normalizeSerial(' 04-a2 3b ')).toBe('04A23B');
  });

  it('recusa número de série inutilizável: vazio, só separadores ou só zeros', () => {
    expect(normalizeSerial('')).toBeNull();
    expect(normalizeSerial('  :: -- ')).toBeNull();
    expect(normalizeSerial('00:00:00:00')).toBeNull();
    expect(normalizeSerial('0000')).toBeNull();
  });

  it('recusa número com mais de 200 caracteres', () => {
    expect(normalizeSerial('A'.repeat(201))).toBeNull();
    expect(normalizeSerial('A'.repeat(200))).toHaveLength(200);
  });
});

describe('serialWithColons', () => {
  it('separa os bytes com dois-pontos', () => {
    expect(serialWithColons('04A23B1C')).toBe('04:A2:3B:1C');
  });

  it('não inventa separador quando o número não é hexadecimal de bytes inteiros', () => {
    expect(serialWithColons('04A')).toBeNull();
    expect(serialWithColons('04ZZ')).toBeNull();
    expect(serialWithColons('')).toBeNull();
  });
});

describe('candidatesFromNfc', () => {
  it('põe o número de série sem separador, depois com dois-pontos, depois o texto gravado', () => {
    expect(candidatesFromNfc({ serialNumber: '04:a2:3b:1c', texts: ['CIL-0007'] })).toEqual([
      { value: '04A23B1C', origin: 'serial' },
      { value: '04:A2:3B:1C', origin: 'serial_colon' },
      { value: 'CIL-0007', origin: 'text' },
    ]);
  });

  it('sem texto gravado, devolve só os dois formatos do número de série', () => {
    expect(candidatesFromNfc({ serialNumber: '04:a2:3b:1c', texts: [] }).map((candidate) => candidate.origin)).toEqual(['serial', 'serial_colon']);
  });

  it('sem número de série utilizável, devolve só o texto gravado', () => {
    expect(candidatesFromNfc({ serialNumber: '00:00:00', texts: ['CIL-0007'] })).toEqual([{ value: 'CIL-0007', origin: 'text' }]);
    expect(candidatesFromNfc({ serialNumber: null, texts: ['CIL-0007'] })).toEqual([{ value: 'CIL-0007', origin: 'text' }]);
  });

  it('sem nenhum candidato utilizável, devolve lista vazia', () => {
    expect(candidatesFromNfc({ serialNumber: '', texts: [] })).toEqual([]);
    expect(candidatesFromNfc({ serialNumber: null, texts: ['   ', ''] })).toEqual([]);
  });

  it('nunca passa de 3 candidatos e fica com o primeiro texto', () => {
    const result = candidatesFromNfc({ serialNumber: '04A23B1C', texts: ['UM', 'DOIS', 'TRÊS'] });
    expect(result).toHaveLength(IDENTIFIER_CANDIDATE_LIMITS.maxCandidates);
    expect(result.map((candidate) => candidate.value)).toEqual(['04A23B1C', '04:A2:3B:1C', 'UM']);
  });

  it('descarta texto com quebra de linha ou com mais de 200 caracteres', () => {
    expect(candidatesFromNfc({ serialNumber: null, texts: ['linha1\nlinha2'] })).toEqual([]);
    expect(candidatesFromNfc({ serialNumber: null, texts: ['x'.repeat(201)] })).toEqual([]);
    expect(candidatesFromNfc({ serialNumber: null, texts: ['x'.repeat(200)] })).toHaveLength(1);
  });

  it('não repete candidato, ignorando maiúsculas e minúsculas', () => {
    expect(candidatesFromNfc({ serialNumber: '04A23B1C', texts: ['04a23b1c'] }).map((candidate) => candidate.origin)).toEqual(['serial', 'serial_colon']);
  });

  it('tira os espaços das pontas do texto gravado', () => {
    expect(candidatesFromNfc({ serialNumber: null, texts: ['  CIL-0007  '] })).toEqual([{ value: 'CIL-0007', origin: 'text' }]);
  });
});

describe('candidateFromScan', () => {
  it('o código lido pela câmera é um único candidato, sem espaços nas pontas', () => {
    expect(candidateFromScan('  CIL-0007 ')).toEqual([{ value: 'CIL-0007', origin: 'scanned' }]);
  });

  it('código vazio, com quebra de linha ou grande demais não gera candidato', () => {
    expect(candidateFromScan('   ')).toEqual([]);
    expect(candidateFromScan('a\nb')).toEqual([]);
    expect(candidateFromScan('x'.repeat(201))).toEqual([]);
  });
});
