import type { EntityStatus, PersonType, Segment } from '@/domain/registry/registry-vocabulary';
import { isObject, num, str, type Raw } from './raw';

// Visões de leitura dos cadastros (contracts/operacoes-servidor.md). O servidor devolve snake_case; aqui vira camelCase, com
// valores desconhecidos recusados (nunca presumidos). Documentos chegam sempre mascarados (CPF) ou completos só no CNPJ.

export interface Page<T> { items: T[]; total: number; next: string | null }

const bool = (value: unknown): boolean => value === true;
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

export function toPage<T>(payload: Raw, key: string, map: (entry: unknown) => T | null): Page<T> | null {
  if (payload.code !== 'LISTED') return null;
  const items = arrayOf(payload[key], map);
  const total = num(payload.total);
  if (items === null) return null;
  return { items, total: total ?? items.length, next: str(payload.next) };
}

// ----- Clientes -----

export interface CustomerListItem {
  id: string;
  personType: PersonType;
  documentDisplay: string;
  legalName: string;
  tradeName: string | null;
  segment: Segment;
  status: EntityStatus;
  cities: string[];
  siteCount: number;
  anonymizedAt: string | null;
}

export interface CustomerView extends Omit<CustomerListItem, 'cities' | 'siteCount'> {
  segmentDetail: string | null;
  notes: string | null;
  version: number;
  createdAt: string | null;
}

export interface ContactView {
  id: string;
  name: string;
  role: string | null;
  // Só vêm para quem tem `customer.write`; os demais papéis recebem nome e função.
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  anonymizedAt: string | null;
}

export interface SiteSummary {
  id: string;
  name: string;
  city: string;
  state: string;
  status: EntityStatus;
  activeGeofences: number;
  anonymizedName: boolean;
}

export interface CustomerDetail { customer: CustomerView; contacts: ContactView[]; sites: SiteSummary[] }

const status = (value: unknown): EntityStatus | null => (value === 'active' || value === 'inactive' ? value : null);
const personType = (value: unknown): PersonType | null => (value === 'legal' || value === 'individual' ? value : null);
const SEGMENT_VALUES = ['hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other'];
const segment = (value: unknown): Segment | null => (typeof value === 'string' && SEGMENT_VALUES.includes(value) ? (value as Segment) : null);

function toCustomerCore(raw: unknown): CustomerListItem | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const type = personType(raw.person_type);
  const state = status(raw.status);
  const seg = segment(raw.segment);
  const legalName = str(raw.legal_name);
  if (id === null || type === null || state === null || seg === null || legalName === null) return null;
  return {
    id, personType: type, documentDisplay: str(raw.document_display) ?? '', legalName, tradeName: str(raw.trade_name), segment: seg, status: state,
    cities: Array.isArray(raw.cities) ? raw.cities.filter((city): city is string => typeof city === 'string') : [],
    siteCount: num(raw.site_count) ?? 0, anonymizedAt: str(raw.anonymized_at),
  };
}

export const toCustomerListItem = toCustomerCore;

export function toCustomerView(raw: unknown): CustomerView | null {
  const core = toCustomerCore(raw);
  if (core === null || !isObject(raw)) return null;
  const version = num(raw.version);
  if (version === null) return null;
  const rest: Partial<CustomerListItem> = { ...core };
  delete rest.cities;
  delete rest.siteCount;
  return { ...(rest as Omit<CustomerListItem, 'cities' | 'siteCount'>), segmentDetail: str(raw.segment_detail), notes: str(raw.notes), version, createdAt: str(raw.created_at) };
}

function toContact(raw: unknown): ContactView | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  if (id === null || name === null) return null;
  return { id, name, role: str(raw.role), phone: str(raw.phone), email: str(raw.email), isPrimary: bool(raw.is_primary), anonymizedAt: str(raw.anonymized_at) };
}

function toSiteSummary(raw: unknown): SiteSummary | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const state = status(raw.status);
  if (id === null || name === null || state === null) return null;
  return {
    id, name, city: str(raw.city) ?? '', state: str(raw.state) ?? '', status: state, activeGeofences: num(raw.active_geofences) ?? 0,
    anonymizedName: raw.anonymized_at !== null && raw.anonymized_at !== undefined,
  };
}

export function toCustomerDetail(payload: Raw): CustomerDetail | null {
  if (payload.code !== 'FOUND') return null;
  const customer = toCustomerView(payload.customer);
  const contacts = arrayOf(payload.contacts ?? [], toContact);
  const sites = arrayOf(payload.sites ?? [], toSiteSummary);
  return customer && contacts && sites ? { customer, contacts, sites } : null;
}

// ----- Unidades -----

export interface SiteView {
  id: string;
  customerId: string;
  customerName: string;
  customerStatus: EntityStatus;
  name: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
  ibgeCode: string | null;
  latitude: number | null;
  longitude: number | null;
  receivingContactName: string | null;
  receivingContactPhone: string | null;
  receivingDays: number[];
  receivingFrom: string | null;
  receivingTo: string | null;
  accessInstructions: string | null;
  status: EntityStatus;
  version: number;
  anonymizedAt: string | null;
  coordinatesSource: 'manual' | 'geocoded' | null;
  coordinatesConfirmedAt: string | null;
  firstDeliveryConfirmed: boolean;
}

export interface SiteListItem {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  city: string;
  state: string;
  status: EntityStatus;
  hasGeofence: boolean;
}

export interface GeofenceSummary { id: string; name: string; shape: 'circle' | 'polygon'; status: EntityStatus }
export interface SiteDetail { site: SiteView; geofences: GeofenceSummary[] }

export function toSiteView(raw: unknown): SiteView | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const customerId = str(raw.customer_id);
  const name = str(raw.name);
  const state = status(raw.status);
  const version = num(raw.version);
  if (id === null || customerId === null || name === null || state === null || version === null) return null;
  return {
    id, customerId, customerName: str(raw.customer_name) ?? '', customerStatus: status(raw.customer_status) ?? 'active', name,
    postalCode: str(raw.postal_code) ?? '', street: str(raw.street) ?? '', number: str(raw.number) ?? '', complement: str(raw.complement),
    district: str(raw.district), city: str(raw.city) ?? '', state: str(raw.state) ?? '', ibgeCode: str(raw.ibge_code), latitude: num(raw.latitude),
    longitude: num(raw.longitude), receivingContactName: str(raw.receiving_contact_name), receivingContactPhone: str(raw.receiving_contact_phone),
    receivingDays: Array.isArray(raw.receiving_days) ? raw.receiving_days.filter((day): day is number => typeof day === 'number') : [],
    receivingFrom: str(raw.receiving_from), receivingTo: str(raw.receiving_to), accessInstructions: str(raw.access_instructions), status: state, version,
    anonymizedAt: str(raw.anonymized_at),
    coordinatesSource: raw.coordinates_source === 'manual' || raw.coordinates_source === 'geocoded' ? raw.coordinates_source : null,
    coordinatesConfirmedAt: str(raw.coordinates_confirmed_at), firstDeliveryConfirmed: raw.first_delivery_confirmed === true,
  };
}

export function toSiteListItem(raw: unknown): SiteListItem | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const customerId = str(raw.customer_id);
  const name = str(raw.name);
  const state = status(raw.status);
  if (id === null || customerId === null || name === null || state === null) return null;
  return { id, customerId, customerName: str(raw.customer_name) ?? '', name, city: str(raw.city) ?? '', state: str(raw.state) ?? '', status: state, hasGeofence: bool(raw.has_geofence) };
}

// Ponto de uma unidade no mapa da Visão geral (list_site_points).
export interface SitePoint {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  confirmed: boolean;
}
export interface SitePoints { items: SitePoint[]; total: number }

function toSitePoint(raw: unknown): SitePoint | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const customerId = str(raw.customer_id);
  const name = str(raw.name);
  const latitude = num(raw.latitude);
  const longitude = num(raw.longitude);
  if (id === null || customerId === null || name === null || latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { id, name, customerId, customerName: str(raw.customer_name) ?? '', city: str(raw.city) ?? '', state: str(raw.state) ?? '', latitude, longitude, confirmed: raw.confirmed === true };
}

export function toSitePoints(payload: Raw): SitePoints | null {
  if (payload.code !== 'FOUND') return null;
  const items = arrayOf(payload.items, toSitePoint);
  return items === null ? null : { items, total: num(payload.total) ?? items.length };
}

function toGeofenceSummary(raw: unknown): GeofenceSummary | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const state = status(raw.status);
  const shape = raw.shape === 'circle' || raw.shape === 'polygon' ? raw.shape : null;
  return id !== null && name !== null && state !== null && shape !== null ? { id, name, shape, status: state } : null;
}

export function toSiteDetail(payload: Raw): SiteDetail | null {
  if (payload.code !== 'FOUND') return null;
  const site = toSiteView(payload.site);
  const geofences = arrayOf(payload.geofences ?? [], toGeofenceSummary);
  return site && geofences ? { site, geofences } : null;
}

// ----- Geocercas -----

export interface GeofenceListItem {
  id: string;
  name: string;
  shape: 'circle' | 'polygon';
  status: EntityStatus;
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;
}

export interface LatLngView { lat: number; lng: number }

export interface GeofenceView {
  id: string;
  name: string;
  shape: 'circle' | 'polygon';
  status: EntityStatus;
  version: number;
  siteId: string;
  siteName: string;
  siteStatus: EntityStatus;
  customerId: string;
  customerName: string;
  areaM2: number | null;
  center: LatLngView | null;
  radiusM: number | null;
  vertices: LatLngView[];
}

export interface OverlapView { id: string; name: string }

const toLatLng = (raw: unknown): LatLngView | null => {
  if (!isObject(raw)) return null;
  const lat = num(raw.lat);
  const lng = num(raw.lng);
  return lat !== null && lng !== null ? { lat, lng } : null;
};

export function toGeofenceListItem(raw: unknown): GeofenceListItem | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.name);
  const state = status(raw.status);
  const shape = raw.shape === 'circle' || raw.shape === 'polygon' ? raw.shape : null;
  const siteId = str(raw.site_id);
  if (id === null || name === null || state === null || shape === null || siteId === null) return null;
  return { id, name, shape, status: state, siteId, siteName: str(raw.site_name) ?? '', customerId: str(raw.customer_id) ?? '', customerName: str(raw.customer_name) ?? '' };
}

export function toGeofenceDetail(payload: Raw): GeofenceView | null {
  if (payload.code !== 'FOUND' || !isObject(payload.geofence)) return null;
  const raw = payload.geofence;
  const id = str(raw.id);
  const name = str(raw.name);
  const state = status(raw.status);
  const version = num(raw.version);
  const shape = raw.shape === 'circle' || raw.shape === 'polygon' ? raw.shape : null;
  const siteId = str(raw.site_id);
  if (id === null || name === null || state === null || version === null || shape === null || siteId === null) return null;
  const vertices = arrayOf(raw.vertices ?? [], toLatLng);
  if (vertices === null) return null;
  return {
    id, name, shape, status: state, version, siteId, siteName: str(raw.site_name) ?? '', siteStatus: status(raw.site_status) ?? 'active',
    customerId: str(raw.customer_id) ?? '', customerName: str(raw.customer_name) ?? '', areaM2: num(raw.area_m2), center: toLatLng(raw.center), radiusM: num(raw.radius_m), vertices,
  };
}

export function toOverlaps(value: unknown): OverlapView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => (isObject(entry) && str(entry.id) !== null && str(entry.name) !== null ? [{ id: str(entry.id) as string, name: str(entry.name) as string }] : []));
}

// ----- Veículos -----

export type ValidityView = 'em_dia' | 'a_vencer' | 'vencido' | 'sem_data';
export type VehicleStatusView = 'available' | 'maintenance' | 'inactive';
export type VehicleTypeView = 'truck' | 'van' | 'utility' | 'other';

export interface VehicleView {
  id: string;
  plate: string;
  vehicleType: VehicleTypeView;
  vehicleTypeDetail: string | null;
  brand: string | null;
  model: string | null;
  manufactureYear: number | null;
  capacityCylinders: number;
  maxLoadKg: number | null;
  licensingDueOn: string | null;
  licensingStatus: ValidityView;
  status: VehicleStatusView;
  version: number;
}

const VALIDITIES = ['em_dia', 'a_vencer', 'vencido', 'sem_data'];
const VEHICLE_STATUSES_LIST = ['available', 'maintenance', 'inactive'];
const VEHICLE_TYPES_LIST = ['truck', 'van', 'utility', 'other'];

export function toVehicleView(raw: unknown): VehicleView | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const plate = str(raw.plate);
  const type = str(raw.vehicle_type);
  const state = str(raw.status);
  const licensing = str(raw.licensing_status);
  const capacity = num(raw.capacity_cylinders);
  const version = num(raw.version);
  if (id === null || plate === null || type === null || !VEHICLE_TYPES_LIST.includes(type) || state === null || !VEHICLE_STATUSES_LIST.includes(state)
    || licensing === null || !VALIDITIES.includes(licensing) || capacity === null || version === null) return null;
  return {
    id, plate, vehicleType: type as VehicleTypeView, vehicleTypeDetail: str(raw.vehicle_type_detail), brand: str(raw.brand), model: str(raw.model),
    manufactureYear: num(raw.manufacture_year), capacityCylinders: capacity, maxLoadKg: num(raw.max_load_kg), licensingDueOn: str(raw.licensing_due_on),
    licensingStatus: licensing as ValidityView, status: state as VehicleStatusView, version,
  };
}

export function toVehicleDetail(payload: Raw): VehicleView | null {
  return payload.code === 'FOUND' ? toVehicleView(payload.vehicle) : null;
}

// ----- Motoristas -----

export interface DriverView {
  id: string;
  fullName: string;
  // CPF e CNH sempre mascarados; o valor completo só sai por `revealDocument` (RF-029, RF-030).
  cpfDisplay: string;
  cnhDisplay: string;
  cnhCategory: string;
  cnhValidUntil: string;
  cnhStatus: ValidityView;
  status: EntityStatus;
  version: number;
  linked: boolean;
  anonymizedAt: string | null;
  // Só no detalhe.
  phone: string | null;
}

export interface LinkedUserView { id: string; displayName: string; active: boolean }
export interface DriverDetail { driver: DriverView; linkedUser: LinkedUserView | null }
export interface LinkableUserView { id: string; displayName: string }

export function toDriverView(raw: unknown): DriverView | null {
  if (!isObject(raw)) return null;
  const id = str(raw.id);
  const name = str(raw.full_name);
  const state = status(raw.status);
  const cnhStatus = str(raw.cnh_status);
  const version = num(raw.version);
  const validUntil = str(raw.cnh_valid_until);
  if (id === null || name === null || state === null || cnhStatus === null || !VALIDITIES.includes(cnhStatus) || version === null || validUntil === null) return null;
  return {
    id, fullName: name, cpfDisplay: str(raw.cpf_display) ?? '', cnhDisplay: str(raw.cnh_display) ?? '', cnhCategory: str(raw.cnh_category) ?? '', cnhValidUntil: validUntil,
    cnhStatus: cnhStatus as ValidityView, status: state, version, linked: bool(raw.linked), anonymizedAt: str(raw.anonymized_at), phone: str(raw.phone),
  };
}

export function toDriverDetail(payload: Raw): DriverDetail | null {
  if (payload.code !== 'FOUND') return null;
  const driver = toDriverView(payload.driver);
  if (driver === null) return null;
  let linkedUser: LinkedUserView | null = null;
  if (isObject(payload.linked_user)) {
    const id = str(payload.linked_user.id);
    if (id === null) return null;
    linkedUser = { id, displayName: str(payload.linked_user.display_name) ?? 'Usuário', active: bool(payload.linked_user.active) };
  }
  return { driver, linkedUser };
}

export function toLinkableUsers(payload: Raw): LinkableUserView[] | null {
  if (payload.code !== 'LISTED') return null;
  return arrayOf(payload.users ?? [], (entry) => {
    if (!isObject(entry)) return null;
    const id = str(entry.id);
    return id === null ? null : { id, displayName: str(entry.display_name) ?? 'Usuário' };
  });
}

// ----- Histórico -----

export interface RegistryEventView {
  id: string;
  sequence: number;
  eventType: string;
  actorName: string | null;
  occurredAt: string;
  justification: string | null;
  // Conteúdo já sem dado pessoal: `changes` (campo, antigo, novo), `changed_sensitive` (só nomes de campos) e contagens.
  data: Record<string, unknown>;
}

export interface RegistryHistoryPage { events: RegistryEventView[]; next: string | null }

export function toRegistryHistory(payload: Raw): RegistryHistoryPage | null {
  if (payload.code !== 'LISTED') return null;
  const events = arrayOf(payload.events ?? [], (entry) => {
    if (!isObject(entry)) return null;
    const id = str(entry.id);
    const sequence = num(entry.sequence);
    const eventType = str(entry.event_type);
    const occurredAt = str(entry.occurred_at);
    if (id === null || sequence === null || eventType === null || occurredAt === null) return null;
    return { id, sequence, eventType, actorName: str(entry.actor_name), occurredAt, justification: str(entry.justification), data: isObject(entry.data) ? entry.data : {} };
  });
  return events ? { events, next: str(payload.next) } : null;
}
