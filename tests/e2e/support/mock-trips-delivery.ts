import { fail, ok, type Json, type Reply } from './mock-registry';
import { TRIP_ACTOR_NAME, type TripMock, type TripOperationContext, type TripRow } from './mock-trips';

// Chegada e entrega por parada do backend simulado (Spec 008, US3). Reproduz specs/008-viagens-paradas-carga/contracts/operacoes-servidor.md:
// chegada em qualquer ordem, entrega por parada inteira, divergência, correção por novo registro, comparação com a geocerca e o nome do
// recebedor só no registro da entrega (nunca no evento). O banco de verdade é provado no pgTAP.

const invalid = (field: string, message: string): Reply => fail('VALIDATION_FAILED', 400, { fields: [{ field, message }] });
const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

function expectInProgress(trip: TripRow): Reply | null {
  if (trip.status === 'completed' || trip.status === 'cancelled') return fail('TRIP_CLOSED', 409);
  if (trip.status !== 'in_progress') return fail('INVALID_TRANSITION', 409, { from: trip.status, to: 'in_progress' });
  return null;
}

function arriveStop({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const state = expectInProgress(trip);
  if (state) return state;
  const stop = mock.stopsOf(trip.id).find((candidate) => candidate.id === body.stop_id && candidate.status !== 'removed');
  if (!stop) return fail('NOT_FOUND', 404, { entity: 'stop' });
  if (stop.status === 'delivered' || stop.status === 'with_divergence') return fail('STOP_CLOSED', 409);
  if (stop.status !== 'pending') return fail('INVALID_TRANSITION', 409, { from: stop.status, to: 'on_site' });
  const outOfOrder = mock.stopsOf(trip.id).some((other) => other.status === 'pending' && (other.position ?? 0) < (stop.position ?? 0));
  stop.status = 'on_site';
  stop.arrived_at = typeof body.arrived_at === 'string' ? body.arrived_at : mock.now().toISOString();
  stop.out_of_order = outOfOrder;
  mock.appendEvent(trip, 'stop_arrived', null, { stop_id: stop.id, position: stop.position, out_of_order: outOfOrder });
  return ok('ARRIVED', { out_of_order: outOfOrder });
}

type Point = { lat: number; lng: number };
const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
function distance(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
function inside(geofence: Json, point: Point): boolean {
  if (geofence.shape === 'circle') return distance(geofence.center as Point, point) <= (geofence.radius_m as number);
  const vertices = geofence.vertices as Point[];
  let result = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i]!;
    const b = vertices[j]!;
    if ((a.lat > point.lat) !== (b.lat > point.lat) && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng) result = !result;
  }
  return result;
}

function registerDelivery({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const state = expectInProgress(trip);
  if (state) return state;
  const stop = mock.stopsOf(trip.id).find((candidate) => candidate.id === body.stop_id && candidate.status !== 'removed');
  if (!stop) return fail('NOT_FOUND', 404, { entity: 'stop' });
  const supersedes = typeof body.supersedes_id === 'string' ? body.supersedes_id : null;
  const own = mock.deliveries.filter((delivery) => delivery.stop_id === stop.id);
  let previous: (typeof own)[number] | undefined;
  if (supersedes === null) {
    if (stop.status === 'delivered' || stop.status === 'with_divergence') return fail('STOP_CLOSED', 409);
    if (stop.status !== 'on_site') return fail('INVALID_TRANSITION', 409, { from: stop.status, to: 'delivered' });
  } else {
    if (stop.status !== 'delivered' && stop.status !== 'with_divergence') return fail('INVALID_TRANSITION', 409, { from: stop.status, to: 'delivered' });
    previous = own.find((delivery) => delivery.id === supersedes);
    if (!previous) return fail('NOT_FOUND', 404, { entity: 'delivery' });
    if (own.some((delivery) => delivery.supersedes_id === supersedes)) return invalid('supersedes_id', 'Este registro já foi corrigido. Corrija o mais recente.');
  }

  const name = asText(body.recipient_name);
  if (name === null || name.length < 2 || name.length > 120) return invalid('recipient_name', 'Informe o nome de quem recebeu, de 2 a 120 caracteres.');
  const role = asText(body.recipient_role);
  if (role !== null && role.length > 80) return invalid('recipient_role', 'Use até 80 caracteres na função.');
  const when = typeof body.delivered_at === 'string' ? Date.parse(body.delivered_at) : Number.NaN;
  if (Number.isNaN(when)) return invalid('delivered_at', 'Informe o horário da entrega.');
  if (when > mock.now().getTime() + 60_000) return invalid('delivered_at', 'O horário da entrega não pode estar no futuro.');
  const hasLat = typeof body.latitude === 'number';
  const hasLng = typeof body.longitude === 'number';
  if (hasLat !== hasLng) return invalid('latitude', 'Informe a latitude e a longitude juntas, ou deixe as duas em branco.');
  const results = Array.isArray(body.results) ? (body.results as Json[]) : null;
  if (results === null) return invalid('results', 'Informe o resultado de cada cilindro.');

  const wanted = mock.itemsOf(trip.id).filter((item) => item.stop_id === stop.id && item.item_status === (supersedes === null ? 'in_transit' : 'not_delivered'));
  const given = results.map((result) => String(result.item_id));
  if (given.some((id) => !wanted.some((item) => item.id === id))) return invalid('results', 'Há cilindro que não estava previsto nesta parada.');
  if (supersedes === null && wanted.length !== given.length) return invalid('results', 'Informe o resultado de todos os cilindros da parada.');
  for (const result of results) {
    const reason = asText(result.reason);
    if (result.delivered !== true && (reason === null || reason.length < 5)) return invalid(`results.${String(result.item_id)}`, 'Explique por que não foi entregue, em 5 a 500 caracteres.');
  }

  let outside: boolean | null = null;
  if (hasLat && hasLng) {
    const active = mock.registry.geofences.filter((geofence) => geofence.site_id === stop.site_id && geofence.status === 'active');
    if (active.length > 0) outside = !active.some((geofence) => inside(geofence, { lat: body.latitude as number, lng: body.longitude as number }));
  }

  const stored: Json[] = [];
  for (const result of results) {
    const item = wanted.find((candidate) => candidate.id === String(result.item_id))!;
    if (result.delivered === true) {
      item.item_status = 'delivered';
      item.divergence_reason = null;
      stored.push({ item_id: item.id, delivered: true, reason: null });
    } else {
      item.item_status = 'not_delivered';
      item.divergence_reason = asText(result.reason);
      stored.push({ item_id: item.id, delivered: false, reason: item.divergence_reason });
    }
  }
  const pending = mock.itemsOf(trip.id).filter((item) => item.stop_id === stop.id && ['in_transit', 'not_delivered'].includes(item.item_status)).length;
  stop.status = pending === 0 ? 'delivered' : 'with_divergence';
  stop.closed_at = mock.now().toISOString();
  const id = mock.nextId('9c');
  mock.deliveries.push({
    id, organization_id: org, stop_id: stop.id, delivered_at: new Date(when).toISOString(), recipient_name: name, recipient_role: role, latitude: hasLat ? (body.latitude as number) : null,
    longitude: hasLng ? (body.longitude as number) : null, at_site_address: body.at_site_address === true, outside_geofence: outside, results: stored, supersedes_id: supersedes,
    recorded_by_name: TRIP_ACTOR_NAME, recorded_at: mock.now().toISOString(),
  });
  // O evento guarda só contagens e indicadores: nunca o nome, a função, a posição nem a justificativa (CA-007).
  mock.appendEvent(trip, supersedes === null ? 'delivery_registered' : 'delivery_corrected', null, {
    stop_id: stop.id, position: stop.position, delivered: stored.filter((entry) => entry.delivered === true).length, not_delivered: stored.filter((entry) => entry.delivered !== true).length, has_recipient: true, outside_geofence: outside,
  });
  return ok('DELIVERED', { delivery_id: id, stop_status: stop.status, outside_geofence: outside });
}

export function registerDeliveryOperations(mock: TripMock): void {
  mock.register('arrive_stop', { kind: 'manage', permission: 'trip.operate', run: arriveStop });
  mock.register('register_delivery', { kind: 'manage', permission: 'trip.operate', run: registerDelivery });
}
