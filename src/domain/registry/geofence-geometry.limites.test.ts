import { describe, expect, it } from 'vitest';
import { isValidCoordinate, validateCircle, validatePolygon } from './geofence-geometry';

// Casos de borda da geometria: coordenadas inválidas em cada limite, toques entre arestas e pontas que voltam sobre si mesmas.
// O servidor repete tudo e é quem decide; aqui o cliente só avisa cedo.

const p = (lat: number, lng: number) => ({ lat, lng });

describe('isValidCoordinate', () => {
  it.each([
    [p(0, 0), true], [p(90, 180), true], [p(-90, -180), true],
    [p(90.0001, 0), false], [p(-90.0001, 0), false], [p(0, 180.0001), false], [p(0, -180.0001), false],
    [p(Number.NaN, 0), false], [p(0, Number.NaN), false], [p(Number.POSITIVE_INFINITY, 0), false], [p(0, Number.NEGATIVE_INFINITY), false],
  ])('%j é válida? %s', (point, expected) => {
    expect(isValidCoordinate(point)).toBe(expected);
  });
});

describe('validateCircle: bordas', () => {
  it('aceita os limites do raio e recusa fora deles, fracionário ou centro inválido', () => {
    expect(validateCircle(p(0, 0), 25)).toEqual({ ok: true });
    expect(validateCircle(p(0, 0), 5000)).toEqual({ ok: true });
    expect(validateCircle(p(0, 0), 24)).toEqual({ ok: false, reason: 'radius_range' });
    expect(validateCircle(p(0, 0), 5001)).toEqual({ ok: false, reason: 'radius_range' });
    expect(validateCircle(p(0, 0), 100.5)).toEqual({ ok: false, reason: 'radius_range' });
    expect(validateCircle(p(95, 0), 100)).toEqual({ ok: false, reason: 'coordinate_range' });
  });
});

describe('validatePolygon: bordas', () => {
  const square = [p(0, 0), p(0, 2), p(2, 2), p(2, 0)];

  it('aceita o quadrado nos dois sentidos', () => {
    expect(validatePolygon(square)).toEqual({ ok: true });
    expect(validatePolygon([...square].reverse())).toEqual({ ok: true });
  });

  it('recusa vértice fora do intervalo antes de contar os vértices', () => {
    expect(validatePolygon([p(0, 0), p(91, 0)])).toEqual({ ok: false, reason: 'coordinate_range' });
  });

  it('recusa menos de 3 e mais de 100 vértices', () => {
    expect(validatePolygon([p(0, 0), p(1, 1)])).toEqual({ ok: false, reason: 'vertex_count' });
    const many = Array.from({ length: 101 }, (_, index) => p(Math.sin(index / 16) * 0.001, Math.cos(index / 16) * 0.001));
    expect(validatePolygon(many)).toEqual({ ok: false, reason: 'vertex_count' });
  });

  it('recusa vértice repetido em sequência, inclusive entre o último e o primeiro', () => {
    expect(validatePolygon([p(0, 0), p(0, 0), p(2, 2), p(2, 0)])).toEqual({ ok: false, reason: 'duplicate_vertex' });
    expect(validatePolygon([p(0, 0), p(0, 2), p(2, 2), p(0, 0)])).toEqual({ ok: false, reason: 'duplicate_vertex' });
  });

  it('todos os vértices alinhados é área zero, não autointerseção', () => {
    expect(validatePolygon([p(0, 0), p(1, 1), p(2, 2)])).toEqual({ ok: false, reason: 'zero_area' });
  });

  it('arestas que se cruzam (gravata) são autointerseção', () => {
    expect(validatePolygon([p(0, 0), p(2, 2), p(0, 2), p(2, 0)])).toEqual({ ok: false, reason: 'self_intersection' });
  });

  it('vértice que encosta em outra aresta é autointerseção (cada vértice da aresta oposta)', () => {
    // O vértice (1,1) cai sobre a aresta (0,0)-(2,0)? Usa um triângulo cujo quarto vértice toca a aresta de baixo.
    expect(validatePolygon([p(0, 0), p(0, 4), p(4, 4), p(4, 0), p(0, 2)].slice(0, 4).concat([p(0, 2)]))).toEqual({ ok: false, reason: 'self_intersection' });
    expect(validatePolygon([p(0, 0), p(0, 4), p(2, 2), p(0, 2.0000001), p(0, 1)])).toEqual({ ok: false, reason: 'self_intersection' });
  });

  it('arestas colineares que se sobrepõem são autointerseção', () => {
    expect(validatePolygon([p(0, 0), p(0, 3), p(3, 3), p(3, 0), p(0, 1), p(0, 2)])).toEqual({ ok: false, reason: 'self_intersection' });
  });

  it('ponta que volta sobre a aresta anterior é autointerseção', () => {
    expect(validatePolygon([p(0, 0), p(0, 2), p(0, 1), p(1, 1)])).toEqual({ ok: false, reason: 'self_intersection' });
  });

  it('ponta no fechamento (última aresta volta sobre a primeira) é autointerseção', () => {
    expect(validatePolygon([p(0, 0), p(0, 1), p(1, 1), p(0, 2)])).toEqual({ ok: false, reason: 'self_intersection' });
  });

  it('arestas vizinhas colineares que seguem na mesma direção formam um polígono válido', () => {
    expect(validatePolygon([p(0, 0), p(0, 1), p(0, 2), p(2, 2), p(2, 0)])).toEqual({ ok: true });
  });

  it('um polígono côncavo sem cruzamento é válido', () => {
    expect(validatePolygon([p(0, 0), p(0, 4), p(2, 2), p(4, 4), p(4, 0)])).toEqual({ ok: true });
  });
});
