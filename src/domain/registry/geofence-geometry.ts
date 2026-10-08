import { GEOFENCE_LIMITS, LATITUDE_RANGE, LONGITUDE_RANGE } from './geofence-limits';

// Validação da forma da geocerca no cliente (RF-014, RF-015, CA-007): o servidor repete tudo e é quem decide.
// Cálculo plano em graus, suficiente para o tamanho das geocercas (no máximo 5 km); a decisão "ponto dentro" é só do servidor.

export interface LatLng {
  lat: number;
  lng: number;
}

export type GeofenceInvalidReason = 'radius_range' | 'vertex_count' | 'self_intersection' | 'zero_area' | 'duplicate_vertex' | 'coordinate_range';
export type GeometryResult = { ok: true } | { ok: false; reason: GeofenceInvalidReason };

const OK: GeometryResult = { ok: true };
const fail = (reason: GeofenceInvalidReason): GeometryResult => ({ ok: false, reason });

export function isValidCoordinate(point: LatLng): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= LATITUDE_RANGE.min && point.lat <= LATITUDE_RANGE.max
    && point.lng >= LONGITUDE_RANGE.min && point.lng <= LONGITUDE_RANGE.max;
}

// Círculo: centro válido e raio inteiro de 25 m a 5 000 m.
export function validateCircle(center: LatLng, radiusM: number): GeometryResult {
  if (!isValidCoordinate(center)) return fail('coordinate_range');
  if (!Number.isInteger(radiusM) || radiusM < GEOFENCE_LIMITS.radiusMinM || radiusM > GEOFENCE_LIMITS.radiusMaxM) return fail('radius_range');
  return OK;
}

const cross = (a: LatLng, b: LatLng, c: LatLng): number => (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
const sign = (value: number): number => (value > 0 ? 1 : value < 0 ? -1 : 0);

// c está sobre o segmento a-b (já sabendo que os três são colineares).
function onSegment(a: LatLng, b: LatLng, c: LatLng): boolean {
  return Math.min(a.lng, b.lng) <= c.lng && c.lng <= Math.max(a.lng, b.lng) && Math.min(a.lat, b.lat) <= c.lat && c.lat <= Math.max(a.lat, b.lat);
}

// Os segmentos p1-p2 e p3-p4 têm algum ponto em comum (cruzamento ou toque, inclusive em vértice).
function segmentsTouch(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const d1 = sign(cross(p3, p4, p1));
  const d2 = sign(cross(p3, p4, p2));
  const d3 = sign(cross(p1, p2, p3));
  const d4 = sign(cross(p1, p2, p4));
  if (d1 !== d2 && d3 !== d4) return true;
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

// Polígono: de 3 a 100 vértices em ordem (o fechamento é automático), sem vértices repetidos em sequência, sem arestas que se
// cruzem ou se toquem, com área maior que zero; os dois sentidos são aceitos.
export function validatePolygon(vertices: readonly LatLng[]): GeometryResult {
  if (vertices.some((vertex) => !isValidCoordinate(vertex))) return fail('coordinate_range');
  const count = vertices.length;
  if (count < GEOFENCE_LIMITS.verticesMin || count > GEOFENCE_LIMITS.verticesMax) return fail('vertex_count');
  const at = (index: number): LatLng => vertices[((index % count) + count) % count] as LatLng;
  for (let i = 0; i < count; i += 1) {
    if (at(i).lat === at(i + 1).lat && at(i).lng === at(i + 1).lng) return fail('duplicate_vertex');
  }
  // Todos os vértices alinhados: não há área (e o anel só "volta sobre si mesmo"), então é área zero, e não autointerseção.
  const first = at(0);
  const second = at(1);
  if (vertices.every((vertex) => cross(first, second, vertex) === 0)) return fail('zero_area');
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === count - 1);
      if (adjacent) {
        // Arestas vizinhas só se encontram no vértice comum; se voltam sobre si mesmas (ponta), é cruzamento.
        const shared = j === i + 1 ? at(j) : at(0);
        const far1 = j === i + 1 ? at(i) : at(j);
        const far2 = j === i + 1 ? at(j + 1) : at(1);
        if (cross(far1, shared, far2) === 0
            && (shared.lng - far1.lng) * (far2.lng - shared.lng) + (shared.lat - far1.lat) * (far2.lat - shared.lat) < 0) {
          return fail('self_intersection');
        }
        continue;
      }
      if (segmentsTouch(at(i), at(i + 1), at(j), at(j + 1))) return fail('self_intersection');
    }
  }
  let doubleArea = 0;
  for (let i = 0; i < count; i += 1) doubleArea += at(i).lng * at(i + 1).lat - at(i + 1).lng * at(i).lat;
  if (Math.abs(doubleArea) < 1e-12) return fail('zero_area');
  return OK;
}
