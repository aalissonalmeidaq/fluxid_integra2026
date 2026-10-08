import { describe, expect, it } from 'vitest';
import { GEOFENCE_LIMITS } from './geofence-limits';
import { type LatLng, validateCircle, validatePolygon } from './geofence-geometry';

// Mesma tabela de casos de supabase/tests/007_geofences.test.sql (CA-007).
const CENTRO: LatLng = { lat: -23.55, lng: -46.633 };

// Quadrado de 0,01° de lado.
const QUADRADO: LatLng[] = [
  { lat: -23.55, lng: -46.63 },
  { lat: -23.55, lng: -46.62 },
  { lat: -23.54, lng: -46.62 },
  { lat: -23.54, lng: -46.63 },
];

describe('limites únicos da geocerca (RF-014, RF-015)', () => {
  it('são os valores do contrato, iguais ao SQL private.geofence_limits()', () => {
    expect(GEOFENCE_LIMITS).toEqual({ radiusMinM: 25, radiusMaxM: 5000, verticesMin: 3, verticesMax: 100 });
  });
});

describe('validateCircle', () => {
  it.each([
    [24, 'radius_range'],
    [25, null],
    [200, null],
    [5000, null],
    [5001, 'radius_range'],
    [0, 'radius_range'],
    [-10, 'radius_range'],
    [25.5, 'radius_range'],
  ] as const)('raio de %s m', (raio, motivo) => {
    const resultado = validateCircle(CENTRO, raio);
    if (motivo === null) expect(resultado).toEqual({ ok: true });
    else expect(resultado).toEqual({ ok: false, reason: motivo });
  });

  it.each([
    [{ lat: 91, lng: 0 }],
    [{ lat: -91, lng: 0 }],
    [{ lat: 0, lng: 181 }],
    [{ lat: 0, lng: -181 }],
    [{ lat: Number.NaN, lng: 0 }],
  ])('centro %j fora do intervalo é recusado', (centro) => {
    expect(validateCircle(centro, 100)).toEqual({ ok: false, reason: 'coordinate_range' });
  });

  it('aceita os extremos do intervalo de coordenadas', () => {
    expect(validateCircle({ lat: 90, lng: 180 }, 100)).toEqual({ ok: true });
    expect(validateCircle({ lat: -90, lng: -180 }, 100)).toEqual({ ok: true });
  });
});

describe('validatePolygon', () => {
  it('aceita um quadrado nos dois sentidos', () => {
    expect(validatePolygon(QUADRADO)).toEqual({ ok: true });
    expect(validatePolygon([...QUADRADO].reverse())).toEqual({ ok: true });
  });

  it('aceita um triângulo (3 vértices) e recusa 2', () => {
    expect(validatePolygon(QUADRADO.slice(0, 3))).toEqual({ ok: true });
    expect(validatePolygon(QUADRADO.slice(0, 2))).toEqual({ ok: false, reason: 'vertex_count' });
    expect(validatePolygon([])).toEqual({ ok: false, reason: 'vertex_count' });
  });

  it('aceita 100 vértices e recusa 101', () => {
    const anel = (n: number): LatLng[] =>
      Array.from({ length: n }, (_, i) => {
        const angulo = (2 * Math.PI * i) / n;
        return { lat: -23.55 + 0.01 * Math.sin(angulo), lng: -46.63 + 0.01 * Math.cos(angulo) };
      });
    expect(validatePolygon(anel(GEOFENCE_LIMITS.verticesMax))).toEqual({ ok: true });
    expect(validatePolygon(anel(GEOFENCE_LIMITS.verticesMax + 1))).toEqual({ ok: false, reason: 'vertex_count' });
  });

  it('recusa polígono em gravata (arestas que se cruzam)', () => {
    const gravata: LatLng[] = [
      { lat: -23.55, lng: -46.63 },
      { lat: -23.54, lng: -46.62 },
      { lat: -23.54, lng: -46.63 },
      { lat: -23.55, lng: -46.62 },
    ];
    expect(validatePolygon(gravata)).toEqual({ ok: false, reason: 'self_intersection' });
  });

  it('recusa polígono em que um vértice encosta em outra aresta', () => {
    const encosta: LatLng[] = [
      { lat: -23.55, lng: -46.63 },
      { lat: -23.55, lng: -46.61 },
      { lat: -23.53, lng: -46.61 },
      { lat: -23.53, lng: -46.63 },
      { lat: -23.55, lng: -46.62 },
    ];
    expect(validatePolygon(encosta)).toEqual({ ok: false, reason: 'self_intersection' });
  });

  it('recusa vértices repetidos em sequência, inclusive o primeiro repetido no fim', () => {
    expect(validatePolygon([QUADRADO[0]!, QUADRADO[0]!, QUADRADO[1]!, QUADRADO[2]!])).toEqual({ ok: false, reason: 'duplicate_vertex' });
    expect(validatePolygon([...QUADRADO, QUADRADO[0]!])).toEqual({ ok: false, reason: 'duplicate_vertex' });
  });

  it('recusa área zero (vértices alinhados)', () => {
    const reta: LatLng[] = [
      { lat: -23.55, lng: -46.63 },
      { lat: -23.545, lng: -46.625 },
      { lat: -23.54, lng: -46.62 },
    ];
    expect(validatePolygon(reta)).toEqual({ ok: false, reason: 'zero_area' });
  });

  it('recusa coordenada fora do intervalo antes de qualquer outra regra', () => {
    expect(validatePolygon([{ lat: 95, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }])).toEqual({ ok: false, reason: 'coordinate_range' });
  });
});
