// Visões de leitura do lacre (Spec 012): convertem a resposta do servidor (snake_case) em tipos da tela. Valor desconhecido é recusado
// (a visão devolve nulo e o serviço trata como indisponível), nunca presumido.
import {
  ALERT_KINDS, ALERT_SEVERITIES, ALERT_STATUSES, COMMAND_KINDS, COMMAND_ORIGINS, COMMAND_STATUSES, HEALTH_STATES, LOCK_STATES, SEAL_STATES,
  type AlertKind, type AlertSeverity, type AlertStatus, type CommandKind, type CommandOrigin, type CommandStatus, type HealthState,
  type LockState, type SealState,
} from '@/domain/seals/seal-vocabulary';
type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

class Unknown extends Error {}
const str = (v: unknown): string => { if (typeof v !== 'string') throw new Unknown(); return v; };
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : str(v));
const num = (v: unknown): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Unknown(); return v; };
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T => { if (!(values as readonly unknown[]).includes(v)) throw new Unknown(); return v as T; };
const obj = (v: unknown): Raw => { if (!isObject(v)) throw new Unknown(); return v; };
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Unknown(); return v; };

export interface SealPosition {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  quality: 'gps' | 'last_known';
  readAt: string;
  lastSeenAt: string;
}
export interface PendingCommand { id: string; kind: 'lock' | 'unlock'; status: CommandStatus; origin: CommandOrigin; createdAt: string }
export interface SealWatchInfo { siteId: string; siteName: string; startedAt: string; suspended: boolean }
export interface SealViolationInfo { id: string; status: 'open' | 'returned' | 'closed'; firstOutsideAt: string; distanceM: number | null; returnedAt: string | null }

export interface SealSummary {
  deviceId: string;
  deviceCode: string;
  label: string;
  status: 'active' | 'inactive';
  health: HealthState;
  lockState: LockState;
  sealState: SealState;
  batteryPct: number | null;
  signalDbm: number | null;
  lastSeenAt: string | null;
  reportIntervalS: number;
  position: SealPosition | null;
  pendingCommand: PendingCommand | null;
  watch: SealWatchInfo | null;
  violation: SealViolationInfo | null;
  // Spec 013: a destinação pelo Master. Sem o campo (resposta antiga), vale "cadastro manual (Spec 012)".
  approvedAt: string | null;
  origin: 'enrollment' | 'manual';
  readyToBind: boolean;
  inactiveReason: 'returned' | 'withdrawn' | 'manual' | null;
  inTrip: boolean;
}

export interface SealListItem extends SealSummary {
  cylinder: { id: string; serialNumber: string; custodyStatus: string } | null;
}

export interface SealCommandRow {
  id: string;
  kind: CommandKind;
  origin: CommandOrigin;
  status: CommandStatus;
  createdAt: string;
  deliveredAt: string | null;
  finishedAt: string | null;
  wifiSsid: string | null;
}
export interface SealAlertRow { id: string; kind: AlertKind; severity: AlertSeverity; status: AlertStatus; openedAt: string; recoveredAt: string | null }

export interface SealDetail extends SealSummary {
  sealCode: string | null;
  activatedAt: string | null;
  firmwareVersion: string | null;
  wifiInUse: { ssid: string; kind: 'default' | 'list'; rssi: number | null; at: string | null } | null;
  wifiSaved: string[];
  wifiAvailable: { ssid: string; rssi: number }[];
  wifiAvailableAt: string | null;
  version: number;
  bindings: { cylinderId: string; serialNumber: string; boundAt: string; unboundAt: string | null; unbindReason: string | null }[];
  commands: SealCommandRow[];
  alerts: SealAlertRow[];
}

export interface TripSealRow { itemId: string; cylinderId: string; serialNumber: string; seal: SealSummary | null; unlockNote: 'outside_geofence' | 'no_proof' | 'no_geofence' | null }

export interface PositionRow {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  quality: 'gps' | 'last_known';
  sealState: SealState;
  batteryPct: number | null;
  readAt: string;
  lastSeenAt: string;
  repeatCount: number;
}

const safe = <T>(read: () => T): T | null => {
  try {
    return read();
  } catch (error) {
    if (error instanceof Unknown) return null;
    throw error;
  }
};

const position = (raw: unknown): SealPosition | null => {
  if (raw === null || raw === undefined) return null;
  const p = obj(raw);
  return {
    latitude: num(p.latitude), longitude: num(p.longitude), accuracyM: numOrNull(p.accuracy_m), quality: oneOf(p.quality, ['gps', 'last_known'] as const),
    readAt: str(p.read_at), lastSeenAt: str(p.last_seen_at),
  };
};

function summary(raw: unknown): SealSummary {
  const s = obj(raw);
  const pending = s.pending_command === null || s.pending_command === undefined ? null : obj(s.pending_command);
  const watch = s.watch === null || s.watch === undefined ? null : obj(s.watch);
  const violation = s.violation === null || s.violation === undefined ? null : obj(s.violation);
  return {
    deviceId: str(s.device_id), deviceCode: str(s.device_code), label: str(s.label), status: oneOf(s.status, ['active', 'inactive'] as const),
    health: oneOf(s.health, HEALTH_STATES), lockState: oneOf(s.lock_state, LOCK_STATES), sealState: oneOf(s.seal_state, SEAL_STATES),
    batteryPct: numOrNull(s.battery_pct), signalDbm: numOrNull(s.signal_dbm), lastSeenAt: strOrNull(s.last_seen_at), reportIntervalS: num(s.report_interval_s),
    position: position(s.position),
    pendingCommand: pending && {
      id: str(pending.id), kind: oneOf(pending.kind, ['lock', 'unlock'] as const), status: oneOf(pending.status, COMMAND_STATUSES),
      origin: oneOf(pending.origin, COMMAND_ORIGINS), createdAt: str(pending.created_at),
    },
    watch: watch && { siteId: str(watch.site_id), siteName: str(watch.site_name), startedAt: str(watch.started_at), suspended: watch.suspended === true },
    violation: violation && {
      id: str(violation.id), status: oneOf(violation.status, ['open', 'returned', 'closed'] as const), firstOutsideAt: str(violation.first_outside_at),
      distanceM: numOrNull(violation.distance_m), returnedAt: strOrNull(violation.returned_at),
    },
    approvedAt: strOrNull(s.approved_at),
    origin: oneOf(s.origin ?? 'manual', ['enrollment', 'manual'] as const),
    readyToBind: s.ready_to_bind === true,
    inactiveReason: s.inactive_reason === null || s.inactive_reason === undefined ? null : oneOf(s.inactive_reason, ['returned', 'withdrawn', 'manual'] as const),
    inTrip: s.in_trip === true,
  };
}

export const toSealSummary = (raw: unknown): SealSummary | null => safe(() => summary(raw));

export const toSealListItem = (raw: unknown): SealListItem | null => safe(() => {
  const r = obj(raw);
  const cylinder = r.cylinder === null || r.cylinder === undefined ? null : obj(r.cylinder);
  return {
    ...summary(r),
    cylinder: cylinder && { id: str(cylinder.id), serialNumber: str(cylinder.serial_number), custodyStatus: str(cylinder.custody_status) },
  };
});

export const toSealDetail = (raw: unknown): SealDetail | null => safe(() => {
  const r = obj(raw);
  const wifi = r.wifi_in_use === null || r.wifi_in_use === undefined ? null : obj(r.wifi_in_use);
  return {
    ...summary(r),
    sealCode: strOrNull(r.seal_code), activatedAt: strOrNull(r.activated_at), firmwareVersion: strOrNull(r.firmware_version),
    wifiInUse: wifi && { ssid: str(wifi.ssid), kind: oneOf(wifi.kind, ['default', 'list'] as const), rssi: numOrNull(wifi.rssi), at: strOrNull(wifi.at) },
    wifiSaved: list(r.wifi_saved).map(str),
    wifiAvailable: list(r.wifi_available ?? []).map((item) => { const network = obj(item); return { ssid: str(network.ssid), rssi: num(network.rssi) }; }),
    wifiAvailableAt: strOrNull(r.wifi_available_at), version: num(r.version),
    bindings: list(r.bindings).map((b) => {
      const x = obj(b);
      return { cylinderId: str(x.cylinder_id), serialNumber: str(x.serial_number), boundAt: str(x.bound_at), unboundAt: strOrNull(x.unbound_at), unbindReason: strOrNull(x.unbind_reason) };
    }),
    commands: list(r.commands).map((c) => {
      const x = obj(c);
      return {
        id: str(x.id), kind: oneOf(x.kind, COMMAND_KINDS), origin: oneOf(x.origin, COMMAND_ORIGINS), status: oneOf(x.status, COMMAND_STATUSES),
        createdAt: str(x.created_at), deliveredAt: strOrNull(x.delivered_at), finishedAt: strOrNull(x.finished_at), wifiSsid: strOrNull(x.wifi_ssid),
      };
    }),
    alerts: list(r.alerts).map((a) => {
      const x = obj(a);
      return {
        id: str(x.id), kind: oneOf(x.kind, ALERT_KINDS), severity: oneOf(x.severity, ALERT_SEVERITIES), status: oneOf(x.status, ALERT_STATUSES),
        openedAt: str(x.opened_at), recoveredAt: strOrNull(x.recovered_at),
      };
    }),
  };
});

export const toTripSealRow = (raw: unknown): TripSealRow | null => safe(() => {
  const r = obj(raw);
  return {
    itemId: str(r.item_id), cylinderId: str(r.cylinder_id), serialNumber: str(r.serial_number), seal: r.seal === null ? null : summary(r.seal),
    unlockNote: r.unlock_note === null || r.unlock_note === undefined ? null : oneOf(r.unlock_note, ['outside_geofence', 'no_proof', 'no_geofence'] as const),
  };
});

export const toPositionRow = (raw: unknown): PositionRow | null => safe(() => {
  const p = obj(raw);
  return {
    latitude: num(p.latitude), longitude: num(p.longitude), accuracyM: numOrNull(p.accuracy_m), quality: oneOf(p.quality, ['gps', 'last_known'] as const),
    sealState: oneOf(p.seal_state, SEAL_STATES), batteryPct: numOrNull(p.battery_pct), readAt: str(p.read_at), lastSeenAt: str(p.last_seen_at),
    repeatCount: num(p.repeat_count),
  };
});

// Converte uma lista inteira; um item desconhecido invalida a lista (a tela mostra "indisponível", não dados pela metade).
export function all<T>(items: unknown, convert: (raw: unknown) => T | null): T[] | null {
  if (!Array.isArray(items)) return null;
  const out: T[] = [];
  for (const item of items) {
    const value = convert(item);
    if (value === null) return null;
    out.push(value);
  }
  return out;
}

export interface AlertView {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  source: 'device' | 'system';
  status: AlertStatus;
  openedAt: string;
  recoveredAt: string | null;
  acknowledgedAt: string | null;
  closedAt: string | null;
  device: { id: string; deviceCode: string; label: string };
  cylinder: { id: string; serialNumber: string } | null;
  tripId: string | null;
  siteId: string | null;
}
export interface AlertDetail extends AlertView { closeNote: string | null; seal: SealSummary | null }

function alertView(raw: unknown): AlertView {
  const a = obj(raw);
  const device = obj(a.device);
  const cylinder = a.cylinder === null || a.cylinder === undefined ? null : obj(a.cylinder);
  return {
    id: str(a.id), kind: oneOf(a.kind, ALERT_KINDS), severity: oneOf(a.severity, ALERT_SEVERITIES), source: oneOf(a.source, ['device', 'system'] as const),
    status: oneOf(a.status, ALERT_STATUSES), openedAt: str(a.opened_at), recoveredAt: strOrNull(a.recovered_at), acknowledgedAt: strOrNull(a.acknowledged_at),
    closedAt: strOrNull(a.closed_at), device: { id: str(device.id), deviceCode: str(device.device_code), label: str(device.label) },
    cylinder: cylinder && { id: str(cylinder.id), serialNumber: str(cylinder.serial_number) },
    tripId: strOrNull(a.trip_id), siteId: strOrNull(a.site_id),
  };
}

// Geocercas sobre o mapa do lacre: a esperada (vigilância ou destino da viagem) e as próximas, com "dentro" e distância do banco.
export interface SealGeofence {
  id: string;
  name: string;
  siteName: string;
  expected: boolean;
  shape: { kind: 'circle'; center: { latitude: number; longitude: number }; radiusM: number }
    | { kind: 'polygon'; vertices: { latitude: number; longitude: number }[] };
  inside: boolean | null;
  distanceM: number | null;
}
export interface SealGeofenceView {
  hasPosition: boolean;
  expectedReason: 'watch' | 'trip' | null;
  expectedSiteName: string | null;
  geofenceAccess: boolean;
  nearbyRadiusM: number;
  geofences: SealGeofence[];
}

const coordinate = (raw: unknown) => { const c = obj(raw); return { latitude: num(c.latitude), longitude: num(c.longitude) }; };

export const toSealGeofenceView = (raw: unknown): SealGeofenceView | null => safe(() => {
  const v = obj(raw);
  return {
    hasPosition: v.has_position === true,
    expectedReason: v.expected_reason === null || v.expected_reason === undefined ? null : oneOf(v.expected_reason, ['watch', 'trip'] as const),
    expectedSiteName: strOrNull(v.expected_site_name),
    geofenceAccess: v.geofence_access === true,
    nearbyRadiusM: num(v.radius_nearby_m),
    geofences: list(v.geofences).map((item) => {
      const g = obj(item);
      const kind = oneOf(g.shape, ['circle', 'polygon'] as const);
      return {
        id: str(g.id), name: str(g.name), siteName: str(g.site_name), expected: g.expected === true,
        shape: kind === 'circle'
          ? { kind, center: coordinate(g.center), radiusM: num(g.radius_m) }
          : { kind, vertices: list(g.vertices).map(coordinate) },
        inside: g.inside === null || g.inside === undefined ? null : g.inside === true,
        distanceM: numOrNull(g.distance_m),
      };
    }),
  };
});

export const toAlertView = (raw: unknown): AlertView | null => safe(() => alertView(raw));
export const toAlertDetail = (raw: unknown): AlertDetail | null => safe(() => {
  const a = obj(raw);
  return { ...alertView(a), closeNote: strOrNull(a.close_note), seal: a.seal === null || a.seal === undefined ? null : summary(a.seal) };
});
