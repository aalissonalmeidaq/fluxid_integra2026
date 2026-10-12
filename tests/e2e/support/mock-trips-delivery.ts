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

// Posição lida pelo aparelho (Spec 009), com as mesmas regras do banco: coordenadas em par e no intervalo; a origem corresponde ao dado; a
// precisão vai de 0 a 100000 e só vale com a posição; o horário da leitura só vale com "gps", sem futuro e com até 10 minutos.
interface ReadPosition { source: 'gps' | 'typed' | 'site_address' | null; accuracy: number | null; readAt: string | null; hasCoordinates: boolean }
function readPosition(body: Json, now: number, allowSiteAddress: boolean): ReadPosition | Reply {
  const hasLat = typeof body.latitude === 'number';
  const hasLng = typeof body.longitude === 'number';
  if (hasLat !== hasLng) return invalid('latitude', 'Informe a latitude e a longitude juntas, ou deixe as duas em branco.');
  if (hasLat && (Math.abs(body.latitude as number) > 90 || Math.abs(body.longitude as number) > 180)) return invalid('latitude', 'A posição está fora do intervalo válido.');
  const atSite = allowSiteAddress && body.at_site_address === true;
  const given = typeof body.position_source === 'string' ? body.position_source : null;
  const allowed = atSite ? ['site_address'] : hasLat ? ['gps', 'typed'] : [];
  if (given !== null && !allowed.includes(given)) return invalid('position_source', 'A origem da posição não confere com os dados.');
  const source = (atSite ? 'site_address' : hasLat ? (given ?? 'typed') : null) as ReadPosition['source'];
  const accuracy = typeof body.accuracy_m === 'number' ? body.accuracy_m : null;
  if (accuracy !== null && (!hasLat || accuracy < 0 || accuracy > 100000)) return invalid('accuracy_m', 'A precisão vai de 0 a 100000 metros e só vale com a posição.');
  const readAt = typeof body.position_read_at === 'string' ? body.position_read_at : null;
  if (readAt !== null) {
    const moment = Date.parse(readAt);
    if (source !== 'gps' || Number.isNaN(moment) || moment > now + 60_000 || moment < now - 10 * 60_000) return invalid('position_read_at', 'O horário da leitura da posição é inválido ou está velho demais.');
  }
  return { source, accuracy, readAt, hasCoordinates: hasLat };
}
const band = (accuracy: number | null): 'good' | 'low' | null => (accuracy === null ? null : accuracy > 100 ? 'low' : 'good');
const isReply = (value: ReadPosition | Reply): value is Reply => 'status' in value;

function arriveStop({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  const state = expectInProgress(trip);
  if (state) return state;
  const stop = mock.stopsOf(trip.id).find((candidate) => candidate.id === body.stop_id && candidate.status !== 'removed');
  if (!stop) return fail('NOT_FOUND', 404, { entity: 'stop' });
  if (stop.status === 'delivered' || stop.status === 'with_divergence') return fail('STOP_CLOSED', 409);
  if (stop.status !== 'pending') return fail('INVALID_TRANSITION', 409, { from: stop.status, to: 'on_site' });
  const read = readPosition(body, mock.now().getTime(), false);
  if (isReply(read)) return read;
  let outsideArrival: boolean | null = null;
  if (read.hasCoordinates) {
    const active = mock.registry.geofences.filter((geofence) => geofence.site_id === stop.site_id && geofence.status === 'active');
    if (active.length > 0) outsideArrival = !active.some((geofence) => inside(geofence, { lat: body.latitude as number, lng: body.longitude as number }));
  }
  const outOfOrder = mock.stopsOf(trip.id).some((other) => other.status === 'pending' && (other.position ?? 0) < (stop.position ?? 0));
  stop.status = 'on_site';
  stop.arrival = read.hasCoordinates
    ? { latitude: body.latitude as number, longitude: body.longitude as number, accuracy_m: read.accuracy, position_source: read.source as 'gps' | 'typed', position_read_at: read.readAt, outside_geofence: outsideArrival }
    : null;
  stop.arrived_at = typeof body.arrived_at === 'string' ? body.arrived_at : mock.now().toISOString();
  stop.out_of_order = outOfOrder;
  mock.appendEvent(trip, 'stop_arrived', null, { stop_id: stop.id, position: stop.position, out_of_order: outOfOrder, position_source: read.source, accuracy_band: band(read.accuracy), outside_geofence: outsideArrival });
  return ok('ARRIVED', { out_of_order: outOfOrder, outside_geofence: outsideArrival });
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
  if (body.at_site_address === true && (hasLat || hasLng)) return invalid('at_site_address', 'Escolha só uma forma de informar a posição: as coordenadas ou no endereço da unidade.');
  const read = readPosition(body, mock.now().getTime(), true);
  if (isReply(read)) return read;
  // RF-015: a correção exige a justificativa de 5 a 500 caracteres (espaços repetidos viram um só); a original não a aceita.
  const reason = typeof body.correction_reason === 'string' ? body.correction_reason.replace(/\s+/g, ' ').trim() : '';
  if (supersedes !== null && (reason.length < 5 || reason.length > 500)) return invalid('correction_reason', 'Explique por que corrige a entrega, em 5 a 500 caracteres.');
  if (supersedes === null && reason !== '') return invalid('correction_reason', 'A justificativa só vale na correção de uma entrega.');
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
      stored.push({ item_id: item.id, delivered: true, reason: null, source: typeof result.source === 'string' ? result.source : 'manual' });
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
    longitude: hasLng ? (body.longitude as number) : null, at_site_address: body.at_site_address === true, outside_geofence: outside, results: stored, supersedes_id: supersedes, correction_reason: supersedes === null ? null : reason,
    accuracy_m: read.accuracy, position_source: read.source, position_read_at: read.readAt,
    recorded_by_name: TRIP_ACTOR_NAME, recorded_at: mock.now().toISOString(),
  });
  // Os dados do evento guardam só contagens e indicadores: nunca o nome, a função nem a posição (CA-007). A justificativa da correção vai na
  // coluna própria do evento, que só quem tem permissão de histórico lê.
  mock.appendEvent(trip, supersedes === null ? 'delivery_registered' : 'delivery_corrected', supersedes === null ? null : reason, {
    stop_id: stop.id, position: stop.position, delivered: stored.filter((entry) => entry.delivered === true).length, not_delivered: stored.filter((entry) => entry.delivered !== true).length, has_recipient: true, outside_geofence: outside, position_source: read.source, accuracy_band: band(read.accuracy),
    sources: stored.reduce<Record<string, number>>((counts, entry) => (typeof entry.source === 'string' ? { ...counts, [entry.source]: (counts[entry.source] ?? 0) + 1 } : counts), {}),
  });
  return ok('DELIVERED', { delivery_id: id, stop_status: stop.status, outside_geofence: outside });
}

export function registerDeliveryOperations(mock: TripMock): void {
  mock.register('arrive_stop', { kind: 'manage', permission: 'trip.operate', run: arriveStop });
  mock.register('register_delivery', { kind: 'manage', permission: 'trip.operate', run: registerDelivery });
}
