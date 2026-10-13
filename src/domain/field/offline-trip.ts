// A viagem guardada no aparelho para operar sem conexão (Spec 010, RF-006, RF-007; data-model.md §2.3). Regras puras: a leitura do corpo do servidor
// com lista **fechada** de campos (nada sensível passa, mesmo que o servidor mande), a busca do cilindro pelo código lido e as mudanças otimistas que a
// tela mostra como "pendente de envio". Nada aqui confirma coisa alguma: quem decide é o servidor, quando a fila é enviada (RN-001).
export interface OfflineCylinder {
  id: string;
  serialNumber: string;
  gas: string;
  capacityValue: number | null;
  capacityUnit: string;
}

export interface OfflineItem {
  id: string;
  stopId: string;
  itemStatus: string;
  lockStatus: string;
  cylinder: OfflineCylinder;
  // Identificadores ativos já normalizados (maiúsculas) pelo servidor.
  identifiers: string[];
  // Verdadeiro enquanto a mudança só existe no aparelho (ainda na fila).
  pending?: boolean;
}

export interface OfflineStop {
  id: string;
  position: number | null;
  status: string;
  arrivedAt: string | null;
  site: { id: string; name: string; city: string; state: string; customerName: string };
  pending?: boolean;
}

export interface OfflineDelivery {
  id: string;
  stopId: string;
}

export interface OfflineTrip {
  id: string;
  number: number;
  plannedDate: string;
  status: 'loading' | 'in_progress';
  version: number;
  vehiclePlate: string;
  stops: OfflineStop[];
  items: OfflineItem[];
  deliveries: OfflineDelivery[];
  fetchedAt: string;
}

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const integer = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function parseItem(value: unknown): OfflineItem | null {
  if (!isObject(value) || !isObject(value.cylinder)) return null;
  const id = text(value.id);
  const stopId = text(value.stop_id);
  const cylinderId = text(value.cylinder.id);
  const serial = text(value.cylinder.serial_number);
  if (!id || !stopId || !cylinderId || !serial) return null;
  return {
    id,
    stopId,
    itemStatus: text(value.item_status) ?? 'planned',
    lockStatus: text(value.lock_status) ?? 'none',
    cylinder: { id: cylinderId, serialNumber: serial, gas: text(value.cylinder.gas) ?? '', capacityValue: integer(value.cylinder.capacity_value), capacityUnit: text(value.cylinder.capacity_unit) ?? '' },
    identifiers: Array.isArray(value.identifiers) ? value.identifiers.filter((entry): entry is string => typeof entry === 'string').map(normalize) : [],
  };
}

function parseStop(value: unknown): OfflineStop | null {
  if (!isObject(value) || !isObject(value.site)) return null;
  const id = text(value.id);
  const siteId = text(value.site.id);
  if (!id || !siteId) return null;
  return {
    id,
    position: integer(value.position),
    status: text(value.status) ?? 'pending',
    arrivedAt: text(value.arrived_at),
    site: { id: siteId, name: text(value.site.name) ?? '', city: text(value.site.city) ?? '', state: text(value.site.state) ?? '', customerName: text(value.site.customer_name) ?? '' },
  };
}

function parseDelivery(value: unknown): OfflineDelivery | null {
  if (!isObject(value)) return null;
  const id = text(value.id);
  const stopId = text(value.stop_id);
  return id && stopId ? { id, stopId } : null;
}

// Corpo de `get_trip_offline` -> viagem guardada. Devolve nulo se o corpo não for uma viagem em carregamento ou em andamento.
export function parseOfflineTrip(raw: unknown): OfflineTrip | null {
  if (!isObject(raw) || raw.code !== 'OK' || !isObject(raw.trip)) return null;
  const id = text(raw.trip.id);
  const status = raw.trip.status;
  const number = integer(raw.trip.number);
  const version = integer(raw.trip.version);
  if (!id || number === null || version === null || (status !== 'loading' && status !== 'in_progress')) return null;
  const stops = (Array.isArray(raw.stops) ? raw.stops : []).map(parseStop).filter((stop): stop is OfflineStop => stop !== null);
  stops.sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
  return {
    id,
    number,
    plannedDate: text(raw.trip.planned_date) ?? '',
    status,
    version,
    vehiclePlate: isObject(raw.vehicle) ? (text(raw.vehicle.plate) ?? '') : '',
    stops,
    items: (Array.isArray(raw.items) ? raw.items : []).map(parseItem).filter((item): item is OfflineItem => item !== null),
    deliveries: (Array.isArray(raw.deliveries) ? raw.deliveries : []).map(parseDelivery).filter((delivery): delivery is OfflineDelivery => delivery !== null),
    fetchedAt: text(raw.fetched_at) ?? '',
  };
}

// O mesmo `upper(btrim(valor))` que o servidor usa em `value_normalized`.
function normalize(value: string): string {
  return value.trim().toUpperCase();
}

// Acha o item pelo código lido, entre os identificadores da própria viagem; o candidato que casa primeiro vale. Código fora da viagem devolve nulo:
// sem o servidor não dá para distinguir "de outra organização" de "inexistente", então nada é conferido (RF-006).
export function findItemByCandidates(trip: OfflineTrip, candidates: readonly string[]): OfflineItem | null {
  for (const candidate of candidates) {
    const wanted = normalize(candidate);
    if (wanted === '') continue;
    const found = trip.items.find((item) => item.identifiers.includes(wanted));
    if (found) return found;
  }
  return null;
}

export const stopItems = (trip: OfflineTrip, stopId: string): OfflineItem[] => trip.items.filter((item) => item.stopId === stopId);

const mapItem = (trip: OfflineTrip, itemId: string, change: (item: OfflineItem) => OfflineItem): OfflineTrip =>
  ({ ...trip, items: trip.items.map((item) => (item.id === itemId ? change(item) : item)) });
const mapStop = (trip: OfflineTrip, stopId: string, change: (stop: OfflineStop) => OfflineStop): OfflineTrip =>
  ({ ...trip, stops: trip.stops.map((stop) => (stop.id === stopId ? change(stop) : stop)) });
const withoutPending = <T extends { pending?: boolean }>(entry: T): T => { const rest = { ...entry }; delete rest.pending; return rest; };

export const applyChecked = (trip: OfflineTrip, itemId: string): OfflineTrip => mapItem(trip, itemId, (item) => ({ ...item, itemStatus: 'checked', pending: true }));
export const applyUnchecked = (trip: OfflineTrip, itemId: string): OfflineTrip => mapItem(trip, itemId, (item) => ({ ...withoutPending(item), itemStatus: 'planned' }));
// Desfazer uma conferência que o servidor já confirmou: o item volta a planejado, mas a mudança ainda está só na fila (pendente).
export const applyUncheckQueued = (trip: OfflineTrip, itemId: string): OfflineTrip => mapItem(trip, itemId, (item) => ({ ...item, itemStatus: 'planned', pending: true }));
export const applyArrived = (trip: OfflineTrip, stopId: string, arrivedAt: string): OfflineTrip => mapStop(trip, stopId, (stop) => ({ ...stop, status: 'on_site', arrivedAt, pending: true }));

// Entrega: cada item vira entregue ou não entregue, e a parada fecha como entregue (todos entregues) ou com divergência.
export function applyDelivered(trip: OfflineTrip, stopId: string, results: readonly { itemId: string; delivered: boolean }[]): OfflineTrip {
  let next = trip;
  for (const result of results) next = mapItem(next, result.itemId, (item) => ({ ...item, itemStatus: result.delivered ? 'delivered' : 'not_delivered', pending: true }));
  const all = results.length > 0 && results.every((result) => result.delivered);
  return mapStop(next, stopId, (stop) => ({ ...stop, status: all ? 'delivered' : 'with_divergence', pending: true }));
}

// Depois que o servidor confirma operações da fila: tira a marca "pendente" do que não tem mais nada na fila (o que ainda tem continua pendente).
export function settlePending(trip: OfflineTrip, stillPending: { itemIds: ReadonlySet<string>; stopIds: ReadonlySet<string> }): OfflineTrip {
  return {
    ...trip,
    items: trip.items.map((item) => (item.pending && !stillPending.itemIds.has(item.id) ? withoutPending(item) : item)),
    stops: trip.stops.map((stop) => (stop.pending && !stillPending.stopIds.has(stop.id) ? withoutPending(stop) : stop)),
  };
}

// Operação descartada: desfaz, na cópia guardada, o que a tela mostrava como pendente (melhor esforço: volta ao estado de antes de a pessoa registrar). A cópia
// é atualizada de verdade na próxima abertura da viagem com conexão.
export function revertOptimistic(trip: OfflineTrip, operation: string, refs: { itemId?: string; stopId?: string; itemIds?: readonly string[] }): OfflineTrip {
  const restore = (itemId: string, itemStatus: string): OfflineTrip => mapItem(trip, itemId, (item) => ({ ...withoutPending(item), itemStatus }));
  switch (operation) {
    case 'trip.check_item': return refs.itemId ? restore(refs.itemId, 'planned') : trip;
    case 'trip.uncheck_item': return refs.itemId ? restore(refs.itemId, 'checked') : trip;
    case 'trip.arrive_stop': return refs.stopId ? mapStop(trip, refs.stopId, (stop) => ({ ...withoutPending(stop), status: 'pending', arrivedAt: null })) : trip;
    case 'trip.deliver': {
      if (!refs.stopId) return trip;
      let next = trip;
      for (const itemId of refs.itemIds ?? []) next = mapItem(next, itemId, (item) => ({ ...withoutPending(item), itemStatus: 'in_transit' }));
      return mapStop(next, refs.stopId, (stop) => ({ ...withoutPending(stop), status: 'on_site' }));
    }
    default: return trip;
  }
}
