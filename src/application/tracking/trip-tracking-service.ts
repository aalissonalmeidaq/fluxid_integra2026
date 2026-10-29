// Acompanhamento das viagens em andamento (Spec 015, US1) sobre a Edge Function `query-tracking`. Converte a resposta numa view única
// para mapa, lista e contadores (RF-006): o frescor sai da regra vigente e do relógio injetado, trechos do mapa são separados nas
// lacunas e nenhuma posição é estimada. Sem conexão, nem chama o servidor; nada é guardado no aparelho.
import {
  degradationOf, freshnessOf, segmentTrail,
  type Degradation, type PositionEvidence, type RuleLimits, type SessionState,
} from '@/domain/tracking/freshness';
import type { TrackingCursor } from '@/domain/tracking/tracking-types';
import type { TrackingFilters } from '@/domain/tracking/tracking-filters';
import type { Clock, TrackingTransport } from './tracking-ports';
import { systemClock } from './tracking-ports';
import type {
  ActiveTripRowView, ActiveTripsView, CounterView, MapSegment, OriginView, TimelineItem, TrackedPositionView, TrackingTimelineView,
} from './tracking-views';

type Raw = Record<string, unknown>;

export type TrackingFailureKind = 'offline' | 'unavailable' | 'session_expired' | 'access_denied' | 'not_found' | 'invalid';
export type TrackingOutcome<T> = { kind: 'success'; value: T } | { kind: TrackingFailureKind };

const FAILURES: Record<string, TrackingFailureKind> = {
  AUTH_REQUIRED: 'session_expired', ACCESS_DENIED: 'access_denied', NOT_FOUND: 'not_found', VALIDATION_FAILED: 'invalid',
};

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

export function toRule(raw: unknown): RuleLimits | null {
  if (!isObject(raw)) return null;
  const distanceM = num(raw.distance_m);
  const maxAgeS = num(raw.max_age_s);
  const maxAccuracyM = num(raw.max_accuracy_m);
  const version = num(raw.version);
  return distanceM !== null && maxAgeS !== null && maxAccuracyM !== null && version !== null ? { distanceM, maxAgeS, maxAccuracyM, version } : null;
}

function toSession(raw: unknown): SessionState | null | undefined {
  if (raw === null) return null;
  if (!isObject(raw)) return undefined;
  const status = str(raw.status);
  const capability = str(raw.capability);
  const changed = str(raw.capability_changed_at);
  if (!status || !capability || !changed) return undefined;
  return {
    status: status as SessionState['status'], capability: capability as SessionState['capability'],
    capabilityChangedAt: changed, notificationsDenied: raw.notifications_denied === true,
  };
}

export function toPosition(raw: unknown, origin: 'mobile' | 'seal', subjectId: string, rule: RuleLimits, now: Date): TrackedPositionView | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const observedAt = str(raw.observed_at);
  const receivedAt = str(raw.received_at);
  const latitude = num(raw.latitude);
  const longitude = num(raw.longitude);
  if (!id || !observedAt || !receivedAt || latitude === null || longitude === null) return null;
  const evidence: PositionEvidence = {
    observedAt, confirmedAt: str(raw.confirmed_at), accuracyM: num(raw.accuracy_m), lastKnown: raw.quality === 'last_known',
  };
  return {
    id, origin, subjectId, observedAt, receivedAt, confirmedAt: evidence.confirmedAt ?? null, accuracyM: evidence.accuracyM,
    freshness: freshnessOf(evidence, rule, now), retrospective: raw.sync_kind === 'retrospective', latitude, longitude,
  };
}

function toRow(raw: unknown, rule: RuleLimits, now: Date): ActiveTripRowView | null {
  if (!isObject(raw) || !isObject(raw.vehicle) || !isObject(raw.driver) || !Array.isArray(raw.seals)) return null;
  const tripId = str(raw.trip_id);
  const tripNumber = num(raw.trip_number);
  const startedAt = str(raw.started_at);
  const session = toSession(raw.session);
  if (!tripId || tripNumber === null || !startedAt || session === undefined) return null;

  const mobile = raw.mobile === null ? null : toPosition(raw.mobile, 'mobile', tripId, rule, now);
  if (raw.mobile !== null && mobile === null) return null;
  const origins: OriginView[] = [{
    key: 'mobile', origin: 'mobile', subjectId: tripId, label: 'Celular do motorista', freshness: mobile ? mobile.freshness : 'missing', position: mobile,
  }];
  for (const seal of raw.seals) {
    if (!isObject(seal)) return null;
    const deviceId = str(seal.device_id);
    if (!deviceId) return null;
    const position = seal.position === null ? null : toPosition(seal.position, 'seal', deviceId, rule, now);
    origins.push({
      key: `seal:${deviceId}`, origin: 'seal', subjectId: deviceId,
      label: [str(seal.label) ?? 'Lacre', str(seal.serial_number)].filter(Boolean).join(' · '),
      freshness: position ? position.freshness : 'missing', position,
    });
  }
  return {
    tripId, tripNumber, startedAt, vehiclePlate: str(raw.vehicle.plate) ?? '', driverName: str(raw.driver.name) ?? '',
    degradation: degradationOf(session, startedAt), origins, openOccurrences: num(raw.open_occurrences) ?? 0,
  };
}

function countersOf(rows: readonly ActiveTripRowView[]): CounterView[] {
  const origins = rows.flatMap((row) => row.origins);
  const count = (freshness: string) => origins.filter((origin) => origin.freshness === freshness).length;
  return [
    { key: 'trips', value: rows.length, kind: 'measured', meaning: 'Viagens em andamento no recorte' },
    { key: 'current', value: count('current'), kind: 'measured', meaning: 'Origens com posição atual' },
    { key: 'delayed', value: count('delayed'), kind: 'measured', meaning: 'Origens com posição atrasada' },
    { key: 'missing', value: count('missing'), kind: 'measured', meaning: 'Origens sem posição' },
    { key: 'inconclusive', value: count('inconclusive'), kind: 'measured', meaning: 'Origens com posição inconclusiva' },
    { key: 'degraded', value: rows.filter((row) => row.degradation !== null).length, kind: 'measured', meaning: 'Viagens com acompanhamento degradado' },
  ];
}

const newestFirst = (a: TimelineItem, b: TimelineItem) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id);

function degradationItem(degradation: Degradation | null): TimelineItem[] {
  return degradation ? [{ kind: 'degradation', id: `degradation:${degradation.since}`, occurredAt: degradation.since, endedAt: null, reason: degradation.reason }] : [];
}

// Mantém a seleção da pessoa enquanto o item continuar na view (RF-041).
export function keepSelection(selectedId: string | null, ids: readonly string[]): string | null {
  return selectedId !== null && ids.includes(selectedId) ? selectedId : null;
}

export interface MyDriverTripView {
  id: string;
  number: number;
  status: string;
  plannedDate: string;
  startedAt: string | null;
  vehiclePlate: string;
  stopCount: number;
}
export interface MyDriverTripsView { isDriver: boolean; trips: MyDriverTripView[] }

export interface ListQuery {
  filters?: TrackingFilters;
  cursor?: TrackingCursor | null;
  limit?: number;
}

export class TripTrackingService {
  private readonly clock: Clock;

  constructor(
    private readonly transport: TrackingTransport,
    private readonly isOnline: () => boolean = () => true,
    clock: Clock = systemClock,
  ) {
    this.clock = clock;
  }

  protected now(): Date { return this.clock.now(); }

  protected async run<T>(body: Raw, pick: (payload: Raw) => T | null): Promise<TrackingOutcome<T>> {
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call('query-tracking', body);
      if (response.status === 401) return { kind: 'session_expired' };
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = pick(payload);
        return value === null ? { kind: 'unavailable' } : { kind: 'success', value };
      }
      const kind = typeof payload.code === 'string' ? FAILURES[payload.code] : undefined;
      return { kind: kind && response.status < 500 ? kind : 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  listActive(organizationId: string, query: ListQuery = {}): Promise<TrackingOutcome<ActiveTripsView>> {
    const filters = query.filters ?? {};
    return this.run({
      operation: 'list_active_trip_tracking', organization_id: organizationId,
      ...(filters.tripId ? { trip_id: filters.tripId } : {}), ...(filters.vehicleId ? { vehicle_id: filters.vehicleId } : {}),
      ...(filters.driverId ? { driver_id: filters.driverId } : {}),
      ...(query.cursor ? { cursor_at: query.cursor.occurredAt, cursor_id: query.cursor.id } : {}), limit: query.limit ?? 50,
    }, (p) => {
      const rule = toRule(p.rule);
      const generatedAt = str(p.generated_at);
      if (p.code !== 'LISTED' || !rule || !generatedAt || !Array.isArray(p.items)) return null;
      const now = this.clock.now();
      const rows = p.items.map((item) => toRow(item, rule, now));
      if (rows.some((row) => row === null)) return null;
      const valid = rows as ActiveTripRowView[];
      const cursor = isObject(p.next_cursor) && str(p.next_cursor.at) && str(p.next_cursor.id)
        ? { at: p.next_cursor.at as string, id: p.next_cursor.id as string } : null;
      return { organizationId, generatedAt, rule, rows: valid, counters: countersOf(valid), nextCursor: cursor };
    });
  }

  // Painel do motorista: se a pessoa é a motorista da viagem (não exige tracking.read).
  driverStatus(organizationId: string, tripId: string): Promise<TrackingOutcome<{ isDriver: boolean; tripStatus: string }>> {
    return this.run({ operation: 'get_driver_tracking_status', organization_id: organizationId, trip_id: tripId },
      (p) => (p.code === 'FOUND' && typeof p.is_driver === 'boolean' && typeof p.trip_status === 'string' ? { isDriver: p.is_driver, tripStatus: p.trip_status } : null));
  }

  // "Minha viagem": as viagens planejadas ou em andamento da própria pessoa motorista (só o vínculo; não exige trip.read).
  myDriverTrips(organizationId: string): Promise<TrackingOutcome<MyDriverTripsView>> {
    return this.run({ operation: 'list_my_driver_trips', organization_id: organizationId }, (p) => {
      if (p.code !== 'FOUND' || typeof p.is_driver !== 'boolean' || !Array.isArray(p.trips)) return null;
      const trips = p.trips.map((raw): MyDriverTripView | null => {
        if (!isObject(raw) || !str(raw.id) || typeof raw.number !== 'number' || !str(raw.status) || !str(raw.planned_date)
          || !str(raw.vehicle_plate) || typeof raw.stop_count !== 'number' || (raw.started_at !== null && !str(raw.started_at))) return null;
        return { id: raw.id as string, number: raw.number, status: raw.status as string, plannedDate: raw.planned_date as string,
          startedAt: (raw.started_at as string | null), vehiclePlate: raw.vehicle_plate as string, stopCount: raw.stop_count };
      });
      return trips.some((trip) => trip === null) ? null : { isDriver: p.is_driver, trips: trips as MyDriverTripView[] };
    });
  }

  getTrip(organizationId: string, tripId: string): Promise<TrackingOutcome<TrackingTimelineView>> {
    return this.run({ operation: 'get_trip_tracking', organization_id: organizationId, trip_id: tripId }, (p) => {
      const rule = toRule(p.rule);
      const generatedAt = str(p.generated_at);
      if (p.code !== 'FOUND' || !rule || !generatedAt || !isObject(p.recent)) return null;
      const now = this.clock.now();
      const trip = toRow(p.trip, rule, now);
      if (!trip || !Array.isArray(p.recent.mobile) || !Array.isArray(p.recent.seals)) return null;

      const tracks: { key: string; origin: 'mobile' | 'seal'; subjectId: string; positions: TrackedPositionView[] }[] = [];
      const mobile = p.recent.mobile.map((raw) => toPosition(raw, 'mobile', trip.tripId, rule, now));
      if (mobile.some((position) => position === null)) return null;
      tracks.push({ key: 'mobile', origin: 'mobile', subjectId: trip.tripId, positions: mobile as TrackedPositionView[] });
      for (const seal of p.recent.seals) {
        if (!isObject(seal) || !str(seal.device_id) || !Array.isArray(seal.positions)) return null;
        const deviceId = seal.device_id as string;
        const positions = seal.positions.map((raw) => toPosition(raw, 'seal', deviceId, rule, now));
        if (positions.some((position) => position === null)) return null;
        tracks.push({ key: `seal:${deviceId}`, origin: 'seal', subjectId: deviceId, positions: positions as TrackedPositionView[] });
      }

      const segments: MapSegment[] = [];
      const items: TimelineItem[] = [...degradationItem(trip.degradation)];
      for (const track of tracks) {
        const trail = segmentTrail(track.positions, rule);
        trail.segments.forEach((ids, index) => segments.push({ id: `${track.key}:${index}`, origin: track.origin, subjectId: track.subjectId, positionIds: ids }));
        for (const gap of trail.gaps) {
          items.push({ kind: 'gap', id: `gap:${track.key}:${gap.from}`, occurredAt: gap.from, endedAt: gap.to, origin: track.origin, subjectId: track.subjectId });
        }
        for (const position of track.positions) items.push({ kind: 'position', id: position.id, occurredAt: position.observedAt, position });
      }
      items.sort(newestFirst);

      return {
        organizationId, generatedAt, rule, trip, positions: tracks.flatMap((track) => track.positions), items, segments,
        counters: countersOf([trip]),
      };
    });
  }
}
