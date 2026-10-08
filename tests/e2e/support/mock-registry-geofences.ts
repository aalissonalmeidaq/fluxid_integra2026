import { validateCircle, validatePolygon, type LatLng } from '../../../src/domain/registry/geofence-geometry';
import { fail, ok, type Json, type OperationContext, type RegistryMock, type Reply } from './mock-registry';

// Geocercas do backend simulado (Spec 007, US3). A decisão "ponto dentro" reproduz a regra do banco: círculo por distância ao
// centro (a borda conta como dentro) e polígono por ray casting, com o contorno incluído. As regras de verdade são provadas nas
// suítes pgTAP; aqui basta o comportamento observável pela tela.

const lower = (value: unknown): string => String(value ?? '').toLowerCase();
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const EARTH_RADIUS_M = 6_371_008.8;

function distanceM(a: LatLng, b: LatLng): number {
  const rad = (degrees: number): number => (degrees * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function onSegment(p: LatLng, a: LatLng, b: LatLng): boolean {
  const cross = (b.lng - a.lng) * (p.lat - a.lat) - (b.lat - a.lat) * (p.lng - a.lng);
  return cross === 0 && Math.min(a.lat, b.lat) <= p.lat && p.lat <= Math.max(a.lat, b.lat) && Math.min(a.lng, b.lng) <= p.lng && p.lng <= Math.max(a.lng, b.lng);
}

function insidePolygon(point: LatLng, vertices: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i] as LatLng;
    const b = vertices[j] as LatLng;
    if (onSegment(point, a, b)) return true;
    if ((a.lat > point.lat) !== (b.lat > point.lat) && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

function contains(geofence: Json, point: LatLng): boolean {
  if (geofence.shape === 'circle') return distanceM(geofence.center as LatLng, point) <= (geofence.radius_m as number);
  return insidePolygon(point, geofence.vertices as LatLng[]);
}

const siteOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => mock.sites.find((site) => site.id === id && site.organization_id === org);
const customerOfSite = (mock: RegistryMock, site: Json): Json => mock.customers.find((customer) => customer.id === site.customer_id) ?? {};
const geofenceOf = (mock: RegistryMock, org: string, id: unknown): Json | undefined => mock.geofences.find((geofence) => geofence.id === id && geofence.organization_id === org);

function shapeError(body: Json): Reply | null {
  if (body.shape === 'circle') {
    const result = validateCircle(body.center as LatLng, body.radius_m as number);
    return result.ok ? null : fail('GEOMETRY_INVALID', 400, { reason: result.reason });
  }
  const result = validatePolygon((body.vertices ?? []) as LatLng[]);
  return result.ok ? null : fail('GEOMETRY_INVALID', 400, { reason: result.reason });
}

// Aproximação de interseção suficiente para o aviso: as caixas das formas se tocam.
function bounds(geofence: Json): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  if (geofence.shape === 'circle') {
    const center = geofence.center as LatLng;
    const dLat = ((geofence.radius_m as number) / EARTH_RADIUS_M) * (180 / Math.PI);
    const dLng = dLat / Math.cos((center.lat * Math.PI) / 180);
    return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLng: center.lng - dLng, maxLng: center.lng + dLng };
  }
  const vertices = geofence.vertices as LatLng[];
  return { minLat: Math.min(...vertices.map((v) => v.lat)), maxLat: Math.max(...vertices.map((v) => v.lat)), minLng: Math.min(...vertices.map((v) => v.lng)), maxLng: Math.max(...vertices.map((v) => v.lng)) };
}
function overlapsOf(mock: RegistryMock, geofence: Json): Json[] {
  const a = bounds(geofence);
  return mock.geofences
    .filter((other) => other.id !== geofence.id && other.site_id === geofence.site_id && other.status === 'active')
    .filter((other) => {
      const b = bounds(other);
      return a.minLat <= b.maxLat && b.minLat <= a.maxLat && a.minLng <= b.maxLng && b.minLng <= a.maxLng;
    })
    .map((other) => ({ id: other.id, name: other.name }));
}

function shapeFields(body: Json): Json {
  return body.shape === 'circle'
    ? { shape: 'circle', center: body.center, radius_m: body.radius_m, vertices: [] }
    : { shape: 'polygon', center: null, radius_m: null, vertices: body.vertices };
}

function createGeofence({ org, body, mock }: OperationContext): Reply {
  const site = siteOf(mock, org, body.site_id);
  if (!site) return fail('NOT_FOUND', 404);
  if (site.status !== 'active') return fail('PARENT_INACTIVE', 409);
  const name = asText(body.name);
  if (name === null || name.length < 2) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'name', message: 'Informe o nome.' }] });
  const invalid = shapeError(body);
  if (invalid) return invalid;
  if (mock.geofences.some((geofence) => geofence.site_id === site.id && lower(geofence.name) === lower(name))) return fail('NAME_CONFLICT', 409);
  const id = mock.nextId('84');
  const geofence: Json = { id, organization_id: org, site_id: site.id, name, ...shapeFields(body), status: 'active', version: 1 };
  mock.geofences.push(geofence);
  mock.appendEvent('geofence', id, org, 'geofence_created', null, { site_id: site.id });
  return ok('CREATED', { geofence_id: id, version: 1, overlaps: overlapsOf(mock, geofence) });
}

function updateGeofence({ org, body, mock }: OperationContext): Reply {
  const geofence = geofenceOf(mock, org, body.geofence_id);
  if (!geofence) return fail('NOT_FOUND', 404);
  if (geofence.version !== body.expected_version) return fail('VERSION_CONFLICT', 409);
  if (geofence.status !== 'active') return fail('INACTIVE_RECORD', 409);
  const name = asText(body.name);
  if (name === null || name.length < 2) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'name', message: 'Informe o nome.' }] });
  const invalid = shapeError(body);
  if (invalid) return invalid;
  if (mock.geofences.some((other) => other.id !== geofence.id && other.site_id === geofence.site_id && lower(other.name) === lower(name))) return fail('NAME_CONFLICT', 409);
  Object.assign(geofence, { name, ...shapeFields(body), version: (geofence.version as number) + 1 });
  mock.appendEvent('geofence', geofence.id as string, org, 'geofence_updated', null, {});
  return ok('UPDATED', { version: geofence.version, overlaps: overlapsOf(mock, geofence) });
}

function listItem(mock: RegistryMock, geofence: Json): Json {
  const site = mock.sites.find((candidate) => candidate.id === geofence.site_id) ?? {};
  const customer = customerOfSite(mock, site);
  return { id: geofence.id, name: geofence.name, shape: geofence.shape, status: geofence.status, site_id: site.id, site_name: site.name, customer_id: customer.id, customer_name: customer.legal_name };
}

function listGeofences({ org, body, mock }: OperationContext): Reply {
  const search = lower(body.search).trim();
  const status = typeof body.status === 'string' ? body.status : 'active';
  let items = mock.geofences.filter((geofence) => geofence.organization_id === org && (status === 'all' || geofence.status === status));
  if (typeof body.site_id === 'string') items = items.filter((geofence) => geofence.site_id === body.site_id);
  if (typeof body.shape === 'string') items = items.filter((geofence) => geofence.shape === body.shape);
  const rows = items.map((geofence) => listItem(mock, geofence))
    .filter((row) => typeof body.customer_id !== 'string' || row.customer_id === body.customer_id)
    .filter((row) => search === '' || lower(row.name).includes(search) || lower(row.site_name).includes(search) || lower(row.customer_name).includes(search))
    .sort((a, b) => lower(a.name).localeCompare(lower(b.name)));
  const limit = typeof body.limit === 'number' ? body.limit : 25;
  const offset = typeof body.cursor === 'string' && /^o:\d+$/.test(body.cursor) ? Number(body.cursor.slice(2)) : 0;
  return ok('LISTED', { items: rows.slice(offset, offset + limit), total: rows.length, next: offset + limit < rows.length ? `o:${offset + limit}` : null });
}

function getGeofence({ org, body, mock }: OperationContext): Reply {
  const geofence = geofenceOf(mock, org, body.geofence_id);
  if (!geofence) return fail('NOT_FOUND', 404);
  const site = mock.sites.find((candidate) => candidate.id === geofence.site_id) ?? {};
  const customer = customerOfSite(mock, site);
  const area = geofence.shape === 'circle' ? Math.round(Math.PI * (geofence.radius_m as number) ** 2) : 50000;
  return ok('FOUND', {
    geofence: {
      id: geofence.id, name: geofence.name, status: geofence.status, version: geofence.version, shape: geofence.shape, center: geofence.center, radius_m: geofence.radius_m,
      vertices: geofence.vertices, site_id: site.id, site_name: site.name, site_status: site.status, customer_id: customer.id, customer_name: customer.legal_name, area_m2: area,
    },
  });
}

function pointInGeofence({ org, body, mock }: OperationContext): Reply {
  const geofence = geofenceOf(mock, org, body.geofence_id);
  if (!geofence) return fail('NOT_FOUND', 404);
  if (geofence.status !== 'active') return fail('INACTIVE_RECORD', 409);
  return ok('FOUND', { inside: contains(geofence, { lat: body.latitude as number, lng: body.longitude as number }) });
}

function containingPoint({ org, body, mock }: OperationContext): Reply {
  const point = { lat: body.latitude as number, lng: body.longitude as number };
  const found = mock.geofences.filter((geofence) => geofence.organization_id === org && geofence.status === 'active' && contains(geofence, point))
    .map((geofence) => ({ id: geofence.id, name: geofence.name, shape: geofence.shape, site_id: geofence.site_id }));
  return ok('FOUND', { geofences: found });
}

export function registerGeofenceOperations(mock: RegistryMock): void {
  mock.register('create_geofence', { kind: 'manage', permission: 'geofence.write', run: createGeofence });
  mock.register('update_geofence', { kind: 'manage', permission: 'geofence.write', run: updateGeofence });
  mock.register('list_geofences', { kind: 'query', permission: 'geofence.read', run: listGeofences });
  mock.register('get_geofence', { kind: 'query', permission: 'geofence.read', run: getGeofence });
  mock.register('point_in_geofence', { kind: 'query', permission: 'geofence.read', run: pointInGeofence });
  mock.register('geofences_containing_point', { kind: 'query', permission: 'geofence.read', run: containingPoint });
}
