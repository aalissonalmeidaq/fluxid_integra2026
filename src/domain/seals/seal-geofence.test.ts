import { describe, expect, it } from 'vitest';
import { describeGeofenceRelation, formatDistance } from './seal-geofence';

// Spec 012: a relação do lacre com cada geocerca em texto (alternativa ao mapa, RF-042), para conferir se ele está onde deveria.
describe('formatDistance', () => {
  it('metros abaixo de 1 km e quilômetros com uma casa acima', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(451)).toBe('451 m');
    expect(formatDistance(1049)).toBe('1 km');
    expect(formatDistance(1460)).toBe('1,5 km');
    expect(formatDistance(2000)).toBe('2 km');
    expect(formatDistance(49395)).toBe('49,4 km');
  });
});

describe('describeGeofenceRelation', () => {
  it('dentro', () => {
    expect(describeGeofenceRelation({ name: 'Bancada', inside: true, distanceM: 0, expected: false })).toBe('Dentro de Bancada.');
  });

  it('fora, mas na tolerância de 50 m da vigilância', () => {
    expect(describeGeofenceRelation({ name: 'Pátio', inside: false, distanceM: 30, expected: true })).toBe('Fora de Pátio por 30 m, dentro da tolerância de 50 m.');
  });

  it('fora, além da tolerância', () => {
    expect(describeGeofenceRelation({ name: 'Depósito', inside: false, distanceM: 1049, expected: false })).toBe('Fora de Depósito, a 1 km.');
  });

  it('sem posição do lacre ainda', () => {
    expect(describeGeofenceRelation({ name: 'Pátio', inside: null, distanceM: null, expected: true })).toBe('Pátio: sem posição do lacre para comparar.');
  });
});
