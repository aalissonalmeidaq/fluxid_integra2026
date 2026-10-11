import type { ValidityStatus } from '@/domain/shared/validity-status';
import type { VehicleStatus } from '@/domain/registry/registry-vocabulary';
import {
  CUSTODY_STATUSES, ITEM_STATUSES, LOCK_STATUSES, STOP_STATUSES, TRIP_EVENT_TYPES, TRIP_STATUSES,
  type CustodyStatus, type ItemStatus, type LockStatus, type StopStatus, type TripEventType, type TripStatus,
} from '@/domain/trips/trip-vocabulary';
import type { CylinderStatus, HydrostaticStatus, StockStatus } from '@/domain/cylinders/cylinder-types';
import { isObject, num, str, type Raw } from '../registry/raw';
import { toPage as toRegistryPage, type Page } from '../registry/registry-views';

// Visões de leitura das viagens (contracts/operacoes-servidor.md). O servidor devolve snake_case; aqui vira camelCase, com valores
// desconhecidos recusados (nunca presumidos). O nome do recebedor chega do servidor já como "(restrito)" a quem não pode vê-lo.

export type { Page } from '../registry/registry-views';
export const toPage = toRegistryPage;

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);
const VALIDITY: readonly ValidityStatus[] = ['em_dia', 'a_vencer', 'vencido', 'sem_data'];
const HYDRO: readonly HydrostaticStatus[] = ['em_dia', 'a_vencer', 'vencido', 'reprovado', 'sem_teste'];
const VEHICLE_STATUSES: readonly VehicleStatus[] = ['available', 'maintenance', 'inactive'];

const arrayOf = <T>(value: unknown, map: (entry: unknown) => T | null): T[] | null => {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const entry of value) {
    const mapped = map(entry);
    if (mapped === null) return null;
    items.push(mapped);
  }
  return items;
};

// ----- Lista -----

export interface TripListItem {
  id: string;
  number: number;
  plannedDate: string;
  status: TripStatus;
  version: number;
  overdue: boolean;
  vehicle: { id: string; plate: string } | null;
  driver: { id: string; fullName: string } | null;
  stops: number;
  cylinders: number;
  divergences: number;
}

export function toTripListItem(value: unknown): TripListItem | null {
  if (!isObject(value) || typeof value.id !== 'string' || !oneOf(TRIP_STATUSES, value.status)) return null;
  const number = num(value.number);
  const plannedDate = str(value.planned_date);
  if (number === null || plannedDate === null) return null;
  const vehicle = isObject(value.vehicle) && typeof value.vehicle.id === 'string' && typeof value.vehicle.plate === 'string' ? { id: value.vehicle.id, plate: value.vehicle.plate } : null;
  const driver = isObject(value.driver) && typeof value.driver.id === 'string' && typeof value.driver.full_name === 'string' ? { id: value.driver.id, fullName: value.driver.full_name } : null;
  return {
    id: value.id, number, plannedDate, status: value.status, version: num(value.version) ?? 1, overdue: value.overdue === true, vehicle, driver,
    stops: num(value.stops) ?? 0, cylinders: num(value.cylinders) ?? 0, divergences: num(value.divergences) ?? 0,
  };
}

// ----- Detalhe -----

export type TripWarning = 'licensing_expired' | 'licensing_expiring' | 'cnh_expired' | 'cnh_expiring' | 'vehicle_unavailable' | 'driver_inactive';
const WARNINGS: readonly TripWarning[] = ['licensing_expired', 'licensing_expiring', 'cnh_expired', 'cnh_expiring', 'vehicle_unavailable', 'driver_inactive'];

export interface TripHeader {
  id: string;
  number: number;
  plannedDate: string;
  status: TripStatus;
  notes: string | null;
  cancelReason: string | null;
  version: number;
  createdAt: string;
  createdByName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}
export interface TripVehicleView { id: string; plate: string; capacityCylinders: number; status: VehicleStatus; licensingDueOn: string | null; licensingStatus: ValidityStatus }
export interface TripDriverView { id: string; fullName: string; status: 'active' | 'inactive'; cnhValidUntil: string; cnhStatus: ValidityStatus }
export interface TripStopView {
  id: string;
  position: number | null;
  status: StopStatus;
  arrivedAt: string | null;
  outOfOrder: boolean;
  closedAt: string | null;
  site: { id: string; name: string; city: string; state: string; customerId: string; customerName: string };
}
export interface TripItemView {
  id: string;
  stopId: string;
  itemStatus: ItemStatus;
  lockStatus: LockStatus;
  checkedAt: string | null;
  checkedByName: string | null;
  divergenceReason: string | null;
  cylinder: {
    id: string; serialNumber: string; gas: string; capacityValue: number; capacityUnit: string; status: CylinderStatus; stockStatus: StockStatus;
    custodyStatus: CustodyStatus; hydroStatus: HydrostaticStatus;
  };
}
export interface DeliveryResultView { itemId: string; delivered: boolean; reason: string | null }
export interface TripDeliveryView {
  id: string;
  stopId: string;
  deliveredAt: string;
  recipientName: string;
  recipientRole: string | null;
  latitude: number | null;
  longitude: number | null;
  atSiteAddress: boolean;
  outsideGeofence: boolean | null;
  results: DeliveryResultView[];
  supersedesId: string | null;
  recordedByName: string | null;
  recordedAt: string;
}
export interface TripUnlockView { id: string; itemId: string; exceptional: boolean; justification: string | null; aal: 'aal1' | 'aal2'; actorName: string | null; occurredAt: string }

export interface TripDetail {
  trip: TripHeader;
  overdue: boolean;
  vehicle: TripVehicleView;
  driver: TripDriverView;
  stops: TripStopView[];
  items: TripItemView[];
  deliveries: TripDeliveryView[];
  unlocks: TripUnlockView[];
  warnings: TripWarning[];
}

function toHeader(value: unknown): TripHeader | null {
  if (!isObject(value) || typeof value.id !== 'string' || !oneOf(TRIP_STATUSES, value.status)) return null;
  const number = num(value.number);
  const plannedDate = str(value.planned_date);
  const version = num(value.version);
  const createdAt = str(value.created_at);
  if (number === null || plannedDate === null || version === null || createdAt === null) return null;
  return {
    id: value.id, number, plannedDate, status: value.status, notes: str(value.notes), cancelReason: str(value.cancel_reason), version, createdAt,
    createdByName: str(value.created_by_name), startedAt: str(value.started_at), completedAt: str(value.completed_at), cancelledAt: str(value.cancelled_at),
  };
}

function toVehicle(value: unknown): TripVehicleView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.plate !== 'string' || !oneOf(VEHICLE_STATUSES, value.status) || !oneOf(VALIDITY, value.licensing_status)) return null;
  const capacity = num(value.capacity_cylinders);
  if (capacity === null) return null;
  return { id: value.id, plate: value.plate, capacityCylinders: capacity, status: value.status, licensingDueOn: str(value.licensing_due_on), licensingStatus: value.licensing_status };
}

function toDriver(value: unknown): TripDriverView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.full_name !== 'string' || (value.status !== 'active' && value.status !== 'inactive') || !oneOf(VALIDITY, value.cnh_status)) return null;
  const until = str(value.cnh_valid_until);
  if (until === null) return null;
  return { id: value.id, fullName: value.full_name, status: value.status, cnhValidUntil: until, cnhStatus: value.cnh_status };
}

function toStop(value: unknown): TripStopView | null {
  if (!isObject(value) || typeof value.id !== 'string' || !oneOf(STOP_STATUSES, value.status) || !isObject(value.site)) return null;
  const site = value.site;
  if (typeof site.id !== 'string' || typeof site.name !== 'string' || typeof site.city !== 'string' || typeof site.state !== 'string' || typeof site.customer_id !== 'string' || typeof site.customer_name !== 'string') return null;
  return {
    id: value.id, position: num(value.position), status: value.status, arrivedAt: str(value.arrived_at), outOfOrder: value.out_of_order === true, closedAt: str(value.closed_at),
    site: { id: site.id, name: site.name, city: site.city, state: site.state, customerId: site.customer_id, customerName: site.customer_name },
  };
}

function toItem(value: unknown): TripItemView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.stop_id !== 'string' || !oneOf(ITEM_STATUSES, value.item_status) || !oneOf(LOCK_STATUSES, value.lock_status) || !isObject(value.cylinder)) return null;
  const c = value.cylinder;
  const capacity = num(c.capacity_value);
  if (typeof c.id !== 'string' || typeof c.serial_number !== 'string' || typeof c.gas !== 'string' || capacity === null || typeof c.capacity_unit !== 'string') return null;
  if ((c.status !== 'active' && c.status !== 'inactive') || (c.stock_status !== 'in_stock' && c.stock_status !== 'out_of_stock') || !oneOf(CUSTODY_STATUSES, c.custody_status) || !oneOf(HYDRO, c.hydro_status)) return null;
  return {
    id: value.id, stopId: value.stop_id, itemStatus: value.item_status, lockStatus: value.lock_status, checkedAt: str(value.checked_at), checkedByName: str(value.checked_by_name),
    divergenceReason: str(value.divergence_reason),
    cylinder: {
      id: c.id, serialNumber: c.serial_number, gas: c.gas, capacityValue: capacity, capacityUnit: c.capacity_unit, status: c.status, stockStatus: c.stock_status,
      custodyStatus: c.custody_status, hydroStatus: c.hydro_status,
    },
  };
}

function toDelivery(value: unknown): TripDeliveryView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.stop_id !== 'string' || typeof value.recipient_name !== 'string' || !Array.isArray(value.results)) return null;
  const deliveredAt = str(value.delivered_at);
  const recordedAt = str(value.recorded_at);
  if (deliveredAt === null || recordedAt === null) return null;
  const results: DeliveryResultView[] = [];
  for (const entry of value.results) {
    if (!isObject(entry) || typeof entry.item_id !== 'string' || typeof entry.delivered !== 'boolean') return null;
    results.push({ itemId: entry.item_id, delivered: entry.delivered, reason: str(entry.reason) });
  }
  return {
    id: value.id, stopId: value.stop_id, deliveredAt, recipientName: value.recipient_name, recipientRole: str(value.recipient_role), latitude: num(value.latitude), longitude: num(value.longitude),
    atSiteAddress: value.at_site_address === true, outsideGeofence: typeof value.outside_geofence === 'boolean' ? value.outside_geofence : null, results,
    supersedesId: str(value.supersedes_id), recordedByName: str(value.recorded_by_name), recordedAt,
  };
}

function toUnlock(value: unknown): TripUnlockView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.item_id !== 'string' || (value.aal !== 'aal1' && value.aal !== 'aal2')) return null;
  const occurredAt = str(value.occurred_at);
  if (occurredAt === null) return null;
  return { id: value.id, itemId: value.item_id, exceptional: value.exceptional === true, justification: str(value.justification), aal: value.aal, actorName: str(value.actor_name), occurredAt };
}

export function toTripDetail(payload: Raw): TripDetail | null {
  if (payload.code !== 'FOUND') return null;
  const trip = toHeader(payload.trip);
  const vehicle = toVehicle(payload.vehicle);
  const driver = toDriver(payload.driver);
  const stops = arrayOf(payload.stops, toStop);
  const items = arrayOf(payload.items, toItem);
  const deliveries = arrayOf(payload.deliveries, toDelivery);
  const unlocks = arrayOf(payload.unlocks, toUnlock);
  const warnings = arrayOf(payload.warnings, (entry) => (oneOf(WARNINGS, entry) ? entry : null));
  if (!trip || !vehicle || !driver || !stops || !items || !deliveries || !unlocks || !warnings) return null;
  return { trip, overdue: payload.overdue === true, vehicle, driver, stops, items, deliveries, unlocks, warnings };
}

// ----- Opções do formulário e cilindros elegíveis -----

export interface VehicleOption { id: string; plate: string; capacityCylinders: number; licensingDueOn: string | null; licensingStatus: ValidityStatus }
export interface DriverOption { id: string; fullName: string; cnhValidUntil: string; cnhStatus: ValidityStatus }
export interface SiteOption { id: string; name: string; city: string; state: string; customerId: string; customerName: string }
export interface TripOptions { vehicles: VehicleOption[]; drivers: DriverOption[]; sites: SiteOption[] }

export function toTripOptions(payload: Raw): TripOptions | null {
  if (payload.code !== 'LISTED') return null;
  const vehicles = arrayOf(payload.vehicles, (entry): VehicleOption | null => {
    if (!isObject(entry) || typeof entry.id !== 'string' || typeof entry.plate !== 'string' || !oneOf(VALIDITY, entry.licensing_status)) return null;
    const capacity = num(entry.capacity_cylinders);
    return capacity === null ? null : { id: entry.id, plate: entry.plate, capacityCylinders: capacity, licensingDueOn: str(entry.licensing_due_on), licensingStatus: entry.licensing_status };
  });
  const drivers = arrayOf(payload.drivers, (entry): DriverOption | null => {
    if (!isObject(entry) || typeof entry.id !== 'string' || typeof entry.full_name !== 'string' || !oneOf(VALIDITY, entry.cnh_status)) return null;
    const until = str(entry.cnh_valid_until);
    return until === null ? null : { id: entry.id, fullName: entry.full_name, cnhValidUntil: until, cnhStatus: entry.cnh_status };
  });
  const sites = arrayOf(payload.sites, (entry): SiteOption | null => {
    if (!isObject(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.city !== 'string' || typeof entry.state !== 'string' || typeof entry.customer_id !== 'string' || typeof entry.customer_name !== 'string') return null;
    return { id: entry.id, name: entry.name, city: entry.city, state: entry.state, customerId: entry.customer_id, customerName: entry.customer_name };
  });
  return vehicles && drivers && sites ? { vehicles, drivers, sites } : null;
}

export interface EligibleCylinderView { id: string; serialNumber: string; gas: string; capacityValue: number; capacityUnit: string; hydroStatus: HydrostaticStatus }

export function toEligibleCylinder(value: unknown): EligibleCylinderView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.serial_number !== 'string' || typeof value.gas !== 'string' || typeof value.capacity_unit !== 'string' || !oneOf(HYDRO, value.hydro_status)) return null;
  const capacity = num(value.capacity_value);
  return capacity === null ? null : { id: value.id, serialNumber: value.serial_number, gas: value.gas, capacityValue: capacity, capacityUnit: value.capacity_unit, hydroStatus: value.hydro_status };
}

// ----- Histórico (US6) -----

export interface TripEventView {
  id: string;
  sequence: number;
  eventType: TripEventType;
  actorName: string | null;
  occurredAt: string;
  justification: string | null;
  data: Raw;
}

export function toTripEvent(value: unknown): TripEventView | null {
  if (!isObject(value) || typeof value.id !== 'string' || !oneOf(TRIP_EVENT_TYPES, value.event_type)) return null;
  const sequence = num(value.sequence);
  const occurredAt = str(value.occurred_at);
  if (sequence === null || occurredAt === null) return null;
  return { id: value.id, sequence, eventType: value.event_type, actorName: str(value.actor_name), occurredAt, justification: str(value.justification), data: isObject(value.data) ? value.data : {} };
}

// Viagens em que um cilindro ou uma unidade aparece (RF-027): a viagem e a situação daquele cilindro ou daquela parada nela.
export interface TripOfCylinder extends TripListItem { itemStatus: ItemStatus; lockStatus: LockStatus }
export interface TripOfSite extends TripListItem { stopStatus: StopStatus }

export function toTripOfCylinder(value: unknown): TripOfCylinder | null {
  const base = toTripListItem(value);
  if (!base || !isObject(value) || !oneOf(ITEM_STATUSES, value.item_status) || !oneOf(LOCK_STATUSES, value.lock_status)) return null;
  return { ...base, itemStatus: value.item_status, lockStatus: value.lock_status };
}

export function toTripOfSite(value: unknown): TripOfSite | null {
  const base = toTripListItem(value);
  if (!base || !isObject(value) || !oneOf(STOP_STATUSES, value.stop_status)) return null;
  return { ...base, stopStatus: value.stop_status };
}

export interface TripEventPage { events: TripEventView[]; next: string | null }

export function toTripEventPage(payload: Raw): TripEventPage | null {
  if (payload.code !== 'LISTED') return null;
  const events = arrayOf(payload.events, toTripEvent);
  return events === null ? null : { events, next: str(payload.next) };
}

export type { Page as TripPage };
export type { Raw };
