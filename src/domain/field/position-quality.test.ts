// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  accuracyBand, formatAccuracy, isStale, isValidReading, LOW_ACCURACY_ABOVE_M, MAX_ACCURACY_M, POSITION_STALE_AFTER_MS, POSITION_TIMEOUT_MS,
  positionOrigin, type PositionReading,
} from './position-quality';

const reading = (over: Partial<PositionReading> = {}): PositionReading => ({ latitude: -3.7319, longitude: -38.5267, accuracyM: 12, readAt: 1_000_000, ...over });

// RF-009, RF-011, RF-014, RNF-002: os limites da spec viram constantes nomeadas.
describe('limites', () => {
  it('são os da spec: 100 m, 2 minutos e 15 segundos', () => {
    expect(LOW_ACCURACY_ABOVE_M).toBe(100);
    expect(POSITION_STALE_AFTER_MS).toBe(120_000);
    expect(POSITION_TIMEOUT_MS).toBe(15_000);
    expect(MAX_ACCURACY_M).toBe(100_000);
  });
});

describe('accuracyBand', () => {
  it('até 100 m é boa e acima de 100 m é ruim', () => {
    expect(accuracyBand(0)).toBe('good');
    expect(accuracyBand(100)).toBe('good');
    expect(accuracyBand(100.1)).toBe('low');
    expect(accuracyBand(5000)).toBe('low');
  });
});

describe('isStale', () => {
  it('só é velha acima de 2 minutos', () => {
    expect(isStale(1_000, 1_000 + 120_000)).toBe(false);
    expect(isStale(1_000, 1_000 + 120_001)).toBe(true);
  });

  it('aceita datas e milissegundos', () => {
    expect(isStale(new Date(0), new Date(130_000))).toBe(true);
    expect(isStale(new Date(0), new Date(60_000))).toBe(false);
  });

  it('posição do futuro não é velha (relógio do aparelho adiantado)', () => {
    expect(isStale(5_000, 1_000)).toBe(false);
  });
});

describe('isValidReading', () => {
  it('aceita coordenadas e precisão dentro dos intervalos', () => {
    expect(isValidReading(reading())).toBe(true);
    expect(isValidReading(reading({ latitude: 90, longitude: -180, accuracyM: 0 }))).toBe(true);
    expect(isValidReading(reading({ accuracyM: MAX_ACCURACY_M }))).toBe(true);
  });

  it('recusa fora do intervalo, não numérico e precisão negativa ou acima do máximo', () => {
    expect(isValidReading(reading({ latitude: 90.0001 }))).toBe(false);
    expect(isValidReading(reading({ longitude: -180.0001 }))).toBe(false);
    expect(isValidReading(reading({ latitude: Number.NaN }))).toBe(false);
    expect(isValidReading(reading({ accuracyM: -1 }))).toBe(false);
    expect(isValidReading(reading({ accuracyM: MAX_ACCURACY_M + 1 }))).toBe(false);
  });
});

describe('formatAccuracy', () => {
  it('escreve a precisão em texto, em metros inteiros', () => {
    expect(formatAccuracy(12.4)).toBe('cerca de 12 m');
    expect(formatAccuracy(0.2)).toBe('cerca de 1 m');
    expect(formatAccuracy(1500)).toBe('cerca de 1.500 m');
  });
});

// RF-010: a origem registrada sempre corresponde ao dado.
describe('positionOrigin', () => {
  it('"no endereço da unidade" vale quando marcado, mesmo sem coordenadas', () => {
    expect(positionOrigin({ atSiteAddress: true, hasCoordinates: false, fromGps: false, editedByHand: false })).toBe('site_address');
  });

  it('sem coordenadas e sem endereço da unidade não há origem', () => {
    expect(positionOrigin({ atSiteAddress: false, hasCoordinates: false, fromGps: false, editedByHand: false })).toBeNull();
  });

  it('coordenadas lidas pelo aparelho e sem edição são "GPS"', () => {
    expect(positionOrigin({ atSiteAddress: false, hasCoordinates: true, fromGps: true, editedByHand: false })).toBe('gps');
  });

  it('coordenadas do GPS editadas à mão passam a "informada"', () => {
    expect(positionOrigin({ atSiteAddress: false, hasCoordinates: true, fromGps: true, editedByHand: true })).toBe('typed');
  });

  it('coordenadas digitadas são "informada"', () => {
    expect(positionOrigin({ atSiteAddress: false, hasCoordinates: true, fromGps: false, editedByHand: false })).toBe('typed');
  });
});
