import { isObject, num, str, type Raw } from './raw';
import { toRegistryHistory, type RegistryHistoryPage, toDriverDetail, toDriverView, toLinkableUsers, type DriverDetail, type DriverView, type LinkableUserView, toVehicleDetail, toVehicleView, type VehicleView, toCustomerDetail, toGeofenceDetail, toGeofenceListItem, toOverlaps, type GeofenceListItem, type GeofenceView, type OverlapView, toCustomerListItem, toPage, toSiteDetail, toSiteListItem, toSitePoints, type SitePoints, type CustomerDetail, type CustomerListItem, type Page, type SiteDetail, type SiteListItem } from './registry-views';
import type { ContactValue, CustomerFormValue, DriverFormValue, GeofenceFormValue, SiteFormValue, VehicleFormValue } from '@/domain/registry/registry-validation';

// Serviço dos cadastros da Fase 3 (clientes, unidades, geocercas, veículos e motoristas) sobre o transporte das Edge Functions.
// Esqueleto da Fundação: o mapeamento dos códigos do servidor para estados de tela (contracts/operacoes-servidor.md) e os
// executores `query` e `command`, que cada história usa para montar suas operações tipadas. O serviço nunca guarda resposta
// em armazenamento local (RF-046) e, sem conexão, nem chama o servidor (RF-045); escritas nunca são enfileiradas.

export type RegistryFunction = 'query-registry' | 'manage-registry' | 'lookup-postal-code' | 'geocode-address';

export interface RegistryTransport {
  call(fn: RegistryFunction, body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type RegistryFailureKind =
  | 'offline' | 'unavailable' | 'unknown' | 'access_denied' | 'mfa_required' | 'not_found' | 'invalid' | 'justification_required'
  | 'document_conflict' | 'plate_conflict' | 'name_conflict' | 'version_conflict' | 'already_inactive' | 'inactive_record' | 'parent_inactive'
  | 'cascade_changed' | 'user_not_eligible' | 'geometry_invalid' | 'anonymized_record' | 'already_anonymized' | 'active_record'
  | 'confirmation_required' | 'rate_limited';

export interface RegistryFailure {
  kind: RegistryFailureKind;
  // Erros de validação do servidor por campo (nomes do contrato, em snake_case; itens de lista como `contacts.0.name`).
  fields?: Record<string, string>;
  // Cadastro existente que causou o conflito (só da própria organização): nunca traz o documento, só o nome ou a placa.
  owner?: { id: string; label: string };
  // Qual documento causou o conflito (`cpf` ou `cnh_number`), sem o valor.
  conflictField?: string;
  // Motivo da geometria inválida (`radius_range`, `vertex_count`, `self_intersection`, `zero_area`, `duplicate_vertex`, `coordinate_range`).
  geometryReason?: string;
  // Quantidades que mudaram entre a prévia da cascata e a confirmação.
  cascadeCounts?: { sites: number; geofences: number };
  // Limite de taxa da busca de CEP: segundos até poder tentar de novo.
  retryAfterSeconds?: number;
}

export type RegistryOutcome<T> = { kind: 'success'; value: T } | RegistryFailure;

export { isObject, num, str, type Raw } from './raw';
export const compact = (body: Raw): Raw => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));

const FAILURES: Record<string, RegistryFailureKind> = {
  AUTH_REQUIRED: 'access_denied', ACCESS_DENIED: 'access_denied', MFA_REQUIRED: 'mfa_required', NOT_FOUND: 'not_found',
  VALIDATION_FAILED: 'invalid', JUSTIFICATION_REQUIRED: 'justification_required', DOCUMENT_CONFLICT: 'document_conflict',
  PLATE_CONFLICT: 'plate_conflict', NAME_CONFLICT: 'name_conflict', VERSION_CONFLICT: 'version_conflict', ALREADY_INACTIVE: 'already_inactive',
  INACTIVE_RECORD: 'inactive_record', PARENT_INACTIVE: 'parent_inactive', CASCADE_CHANGED: 'cascade_changed',
  USER_NOT_ELIGIBLE: 'user_not_eligible', GEOMETRY_INVALID: 'geometry_invalid', ANONYMIZED_RECORD: 'anonymized_record',
  ALREADY_ANONYMIZED: 'already_anonymized', ACTIVE_RECORD: 'active_record', CONFIRMATION_REQUIRED: 'confirmation_required',
  RATE_LIMITED: 'rate_limited',
};

export interface CreatedRecord { id: string; version: number }
export interface UpdatedRecord { version: number }

export interface CustomerUpdateValue {
  legalName: string; tradeName: string | null; segment: CustomerFormValue['segment']; segmentDetail: string | null; notes: string | null;
  contacts?: ContactValue[]; document?: string | null; justification?: string | null;
}

const toCreated = (payload: Raw, idField: string): CreatedRecord | null => {
  const id = str(payload[idField]);
  const version = num(payload.version);
  return payload.code === 'CREATED' && id !== null && version !== null ? { id, version } : null;
};
const toUpdated = (payload: Raw): UpdatedRecord | null => {
  const version = num(payload.version);
  return payload.code === 'UPDATED' && version !== null ? { version } : null;
};
const toContactBody = (contacts: readonly ContactValue[]): Raw[] =>
  contacts.map((contact) => ({ name: contact.name, role: contact.role, phone: contact.phone, email: contact.email, is_primary: contact.isPrimary }));
const toSiteBody = (value: SiteFormValue): Raw => ({
  name: value.name, postal_code: value.postalCode, street: value.street, number: value.number, complement: value.complement, district: value.district,
  city: value.city, state: value.state, ibge_code: value.ibgeCode, latitude: value.latitude, longitude: value.longitude,
  receiving_contact_name: value.receivingContactName, receiving_contact_phone: value.receivingContactPhone, receiving_days: value.receivingDays,
  receiving_from: value.receivingFrom, receiving_to: value.receivingTo, access_instructions: value.accessInstructions,
  coordinates_source: value.coordinatesSource ?? undefined,
});

export interface ListFilters { search?: string; status?: 'active' | 'available' | 'maintenance' | 'inactive' | 'all'; cursor?: string | null; limit?: number }
export interface CustomerFilters extends ListFilters { segment?: string; state?: string; hasGeofence?: boolean }
export interface SiteFilters extends ListFilters { customerId?: string }

const toListParams = (filters: ListFilters & { segment?: string; state?: string; hasGeofence?: boolean }): Raw => ({
  search: filters.search?.trim() || undefined, status: filters.status, segment: filters.segment || undefined, state: filters.state || undefined,
  has_geofence: filters.hasGeofence, cursor: filters.cursor ?? undefined, limit: filters.limit,
});

export interface GeofenceFilters extends ListFilters { siteId?: string; customerId?: string; shape?: string }

const toGeofenceBody = (value: GeofenceFormValue): Raw =>
  (value.shape === 'circle'
    ? { name: value.name, shape: 'circle', center: value.center, radius_m: value.radiusM }
    : { name: value.name, shape: 'polygon', vertices: value.vertices });

export interface VehicleFilters extends ListFilters { vehicleType?: string; licensingStatus?: string; sort?: 'plate' | 'plate_desc' }

const toVehicleBody = (value: VehicleFormValue): Raw => ({
  plate: value.plate, vehicle_type: value.vehicleType, vehicle_type_detail: value.vehicleTypeDetail, brand: value.brand, model: value.model,
  manufacture_year: value.manufactureYear, capacity_cylinders: value.capacityCylinders, max_load_kg: value.maxLoadKg, licensing_due_on: value.licensingDueOn,
});

export interface DriverFilters extends ListFilters { cnhStatus?: string; linked?: boolean; sort?: 'name' | 'name_desc' }

export interface CascadeCounts { sites: number; geofences: number }

const toCounts = (payload: Raw): CascadeCounts | null =>
  (payload.code === 'FOUND' ? { sites: num(payload.sites) ?? 0, geofences: num(payload.geofences) ?? 0 } : null);
const toChanged = (code: 'INACTIVATED' | 'REACTIVATED') => (payload: Raw): UpdatedRecord | null => (payload.code === code ? { version: num(payload.version) ?? 0 } : null);

export interface HistoryFilters { eventType?: string; from?: string; to?: string; order?: 'asc' | 'desc'; cursor?: string | null; limit?: number }

export interface AnonymizationRequest { reason: 'data_subject_request' | 'retention_expired' | 'other'; justification: string }
export interface AnonymizedResult { anonymizedAt: string }

const toAnonymizationBody = (request: AnonymizationRequest): Raw => ({ reason: request.reason, justification: request.justification, confirmed: true });
const toAnonymized = (payload: Raw): AnonymizedResult | null => (payload.code === 'ANONYMIZED' && typeof payload.anonymized_at === 'string' ? { anonymizedAt: payload.anonymized_at } : null);

export class RegistryService {
  constructor(protected readonly transport: RegistryTransport, protected readonly isOnline: () => boolean = () => true) {}

  protected failureOf(response: { status: number; body: unknown }, write: boolean): RegistryFailure {
    const body = isObject(response.body) ? response.body : {};
    const kind = typeof body.code === 'string' ? FAILURES[body.code] : undefined;
    if (!kind || response.status >= 500) return { kind: write ? 'unknown' : 'unavailable' };
    const failure: RegistryFailure = { kind };
    if (Array.isArray(body.fields)) {
      const fields: Record<string, string> = {};
      for (const entry of body.fields) {
        if (isObject(entry) && typeof entry.field === 'string' && typeof entry.message === 'string') fields[entry.field] = entry.message;
      }
      failure.fields = fields;
    }
    const ownerId = str(body.entity_id) ?? str(body.vehicle_id) ?? str(body.owner_id);
    if (ownerId) failure.owner = { id: ownerId, label: str(body.owner_name) ?? str(body.plate) ?? '' };
    if (typeof body.field === 'string' && kind === 'document_conflict') failure.conflictField = body.field;
    if (typeof body.reason === 'string' && kind === 'geometry_invalid') failure.geometryReason = body.reason;
    if (kind === 'cascade_changed' && isObject(body.counts)) {
      failure.cascadeCounts = { sites: num(body.counts.sites) ?? 0, geofences: num(body.counts.geofences) ?? 0 };
    }
    if (kind === 'rate_limited') failure.retryAfterSeconds = num(body.retry_after_seconds) ?? 60;
    return failure;
  }

  // Executa uma chamada e converte a resposta em sucesso tipado (por `pick`) ou em estado de falha de tela. Resposta 2xx que o
  // `pick` não reconhece é tratada como falha desconhecida (escrita) ou indisponível (leitura), nunca como sucesso.
  protected async run<T>(fn: RegistryFunction, write: boolean, body: Raw, pick: (payload: Raw) => T | null): Promise<RegistryOutcome<T>> {
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call(fn, body);
      if (response.status >= 200 && response.status < 300 && isObject(response.body)) {
        const value = pick(response.body);
        if (value !== null) return { kind: 'success', value };
        return { kind: write ? 'unknown' : 'unavailable' };
      }
      return this.failureOf(response, write);
    } catch {
      return { kind: write ? 'unknown' : 'unavailable' };
    }
  }

  query<T>(organizationId: string, operation: string, params: Raw, pick: (payload: Raw) => T | null): Promise<RegistryOutcome<T>> {
    return this.run('query-registry', false, compact({ operation, organization_id: organizationId, ...params }), pick);
  }

  command<T>(organizationId: string, operation: string, params: Raw, pick: (payload: Raw) => T | null): Promise<RegistryOutcome<T>> {
    return this.run('manage-registry', true, compact({ operation, organization_id: organizationId, ...params }), pick);
  }

  // ----- Clientes e unidades (US1) -----

  createCustomer(organizationId: string, value: CustomerFormValue): Promise<RegistryOutcome<CreatedRecord>> {
    return this.command(organizationId, 'create_customer', {
      person_type: value.personType, document: value.document, legal_name: value.legalName, trade_name: value.tradeName, segment: value.segment,
      segment_detail: value.segmentDetail, notes: value.notes, contacts: toContactBody(value.contacts),
    }, (payload) => toCreated(payload, 'customer_id'));
  }

  // O tipo de pessoa é fixo (RF-001) e não é enviado. `document` só vai quando a pessoa digitou um valor novo, com a justificativa;
  // `contacts` só vai quando a lista foi editada (omitido, o servidor mantém os contatos).
  updateCustomer(organizationId: string, customerId: string, expectedVersion: number, value: CustomerUpdateValue): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'update_customer', {
      customer_id: customerId, expected_version: expectedVersion, legal_name: value.legalName, trade_name: value.tradeName, segment: value.segment,
      segment_detail: value.segmentDetail, notes: value.notes, contacts: value.contacts ? toContactBody(value.contacts) : undefined,
      document: value.document ?? undefined, justification: value.document ? value.justification ?? undefined : undefined,
    }, toUpdated);
  }

  createSite(organizationId: string, customerId: string, value: SiteFormValue): Promise<RegistryOutcome<CreatedRecord>> {
    return this.command(organizationId, 'create_site', { customer_id: customerId, ...toSiteBody(value) }, (payload) => toCreated(payload, 'site_id'));
  }

  updateSite(organizationId: string, siteId: string, expectedVersion: number, value: SiteFormValue): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'update_site', { site_id: siteId, expected_version: expectedVersion, ...toSiteBody(value) }, toUpdated);
  }
  // ----- Consultas de clientes e unidades (US2) -----

  listCustomers(organizationId: string, filters: CustomerFilters): Promise<RegistryOutcome<Page<CustomerListItem>>> {
    return this.query(organizationId, 'list_customers', toListParams(filters), (payload) => toPage(payload, 'items', toCustomerListItem));
  }

  getCustomer(organizationId: string, customerId: string): Promise<RegistryOutcome<CustomerDetail>> {
    return this.query(organizationId, 'get_customer', { customer_id: customerId }, toCustomerDetail);
  }

  // Pontos das unidades ativas com coordenadas, para o mapa da Visão geral (no máximo `limit`, e o total).
  listSitePoints(organizationId: string, limit = 500): Promise<RegistryOutcome<SitePoints>> {
    return this.query(organizationId, 'list_site_points', { limit }, toSitePoints);
  }

  listSites(organizationId: string, filters: SiteFilters): Promise<RegistryOutcome<Page<SiteListItem>>> {
    return this.query(organizationId, 'list_sites', { ...toListParams(filters), customer_id: filters.customerId }, (payload) => toPage(payload, 'items', toSiteListItem));
  }

  getSite(organizationId: string, siteId: string): Promise<RegistryOutcome<SiteDetail>> {
    return this.query(organizationId, 'get_site', { site_id: siteId }, toSiteDetail);
  }
  // ----- Geocercas (US3) -----

  listGeofences(organizationId: string, filters: GeofenceFilters): Promise<RegistryOutcome<Page<GeofenceListItem>>> {
    return this.query(organizationId, 'list_geofences', {
      ...toListParams(filters), site_id: filters.siteId, customer_id: filters.customerId || undefined, shape: filters.shape || undefined,
    }, (payload) => toPage(payload, 'items', toGeofenceListItem));
  }

  getGeofence(organizationId: string, geofenceId: string): Promise<RegistryOutcome<GeofenceView>> {
    return this.query(organizationId, 'get_geofence', { geofence_id: geofenceId }, toGeofenceDetail);
  }

  createGeofence(organizationId: string, siteId: string, value: GeofenceFormValue): Promise<RegistryOutcome<CreatedRecord & { overlaps: OverlapView[] }>> {
    return this.command(organizationId, 'create_geofence', { site_id: siteId, ...toGeofenceBody(value) }, (payload) => {
      const created = toCreated(payload, 'geofence_id');
      return created ? { ...created, overlaps: toOverlaps(payload.overlaps) } : null;
    });
  }

  updateGeofence(organizationId: string, geofenceId: string, expectedVersion: number, value: GeofenceFormValue): Promise<RegistryOutcome<UpdatedRecord & { overlaps: OverlapView[] }>> {
    return this.command(organizationId, 'update_geofence', { geofence_id: geofenceId, expected_version: expectedVersion, ...toGeofenceBody(value) }, (payload) => {
      const updated = toUpdated(payload);
      return updated ? { ...updated, overlaps: toOverlaps(payload.overlaps) } : null;
    });
  }

  // "Testar um ponto": a decisão é sempre do servidor; nada é gravado.
  pointInGeofence(organizationId: string, geofenceId: string, latitude: number, longitude: number): Promise<RegistryOutcome<boolean>> {
    return this.query(organizationId, 'point_in_geofence', { geofence_id: geofenceId, latitude, longitude }, (payload) =>
      (payload.code === 'FOUND' && typeof payload.inside === 'boolean' ? payload.inside : null));
  }
  // ----- Veículos (US4) -----

  listVehicles(organizationId: string, filters: VehicleFilters): Promise<RegistryOutcome<Page<VehicleView>>> {
    return this.query(organizationId, 'list_vehicles', {
      search: filters.search?.trim() || undefined, status: filters.status, vehicle_type: filters.vehicleType || undefined,
      licensing_status: filters.licensingStatus || undefined, sort: filters.sort, cursor: filters.cursor ?? undefined, limit: filters.limit,
    }, (payload) => toPage(payload, 'items', toVehicleView));
  }

  getVehicle(organizationId: string, vehicleId: string): Promise<RegistryOutcome<VehicleView>> {
    return this.query(organizationId, 'get_vehicle', { vehicle_id: vehicleId }, toVehicleDetail);
  }

  createVehicle(organizationId: string, value: VehicleFormValue): Promise<RegistryOutcome<CreatedRecord>> {
    return this.command(organizationId, 'create_vehicle', toVehicleBody(value), (payload) => toCreated(payload, 'vehicle_id'));
  }

  // A justificativa só vai quando a placa muda (RF-020).
  updateVehicle(organizationId: string, vehicleId: string, expectedVersion: number, value: VehicleFormValue, justification: string | null): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'update_vehicle', {
      vehicle_id: vehicleId, expected_version: expectedVersion, ...toVehicleBody(value), justification: justification ?? undefined,
    }, toUpdated);
  }

  changeVehicleStatus(organizationId: string, vehicleId: string, expectedVersion: number, status: 'available' | 'maintenance' | 'inactive', justification: string | null): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'change_vehicle_status', { vehicle_id: vehicleId, expected_version: expectedVersion, status, justification: justification ?? undefined }, (payload) => {
      const version = num(payload.version);
      return payload.code === 'STATUS_CHANGED' && version !== null ? { version } : null;
    });
  }
  // ----- Motoristas e revelação de documento (US5) -----

  listDrivers(organizationId: string, filters: DriverFilters): Promise<RegistryOutcome<Page<DriverView>>> {
    return this.query(organizationId, 'list_drivers', {
      ...toListParams(filters), cnh_status: filters.cnhStatus || undefined, linked: filters.linked, sort: filters.sort,
    }, (payload) => toPage(payload, 'items', toDriverView));
  }

  getDriver(organizationId: string, driverId: string): Promise<RegistryOutcome<DriverDetail>> {
    return this.query(organizationId, 'get_driver', { driver_id: driverId }, toDriverDetail);
  }

  listLinkableUsers(organizationId: string, search?: string): Promise<RegistryOutcome<LinkableUserView[]>> {
    return this.query(organizationId, 'list_linkable_users', { search: search?.trim() || undefined, limit: 100 }, toLinkableUsers);
  }

  createDriver(organizationId: string, value: DriverFormValue): Promise<RegistryOutcome<CreatedRecord>> {
    return this.command(organizationId, 'create_driver', {
      full_name: value.fullName, cpf: value.cpf, cnh_number: value.cnhNumber, cnh_category: value.cnhCategory, cnh_valid_until: value.cnhValidUntil, phone: value.phone,
    }, (payload) => toCreated(payload, 'driver_id'));
  }

  // CPF e CNH só vão quando a pessoa digitou valores novos, com a justificativa (RF-024, RF-031).
  updateDriver(organizationId: string, driverId: string, expectedVersion: number, value: DriverFormValue): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'update_driver', {
      driver_id: driverId, expected_version: expectedVersion, full_name: value.fullName, cnh_category: value.cnhCategory, cnh_valid_until: value.cnhValidUntil, phone: value.phone,
      cpf: value.cpf ?? undefined, cnh_number: value.cnhNumber ?? undefined, justification: value.justification ?? undefined,
    }, toUpdated);
  }

  linkDriverUser(organizationId: string, driverId: string, userId: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'link_driver_user', { driver_id: driverId, user_id: userId }, (payload) => (payload.code === 'LINKED' ? { version: num(payload.version) ?? 0 } : null));
  }

  unlinkDriverUser(organizationId: string, driverId: string, justification: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'unlink_driver_user', { driver_id: driverId, justification }, (payload) => (payload.code === 'UNLINKED' ? { version: num(payload.version) ?? 0 } : null));
  }

  // Única saída do valor completo do documento. Quem chama guarda o valor só em estado de componente e o descarta ao ocultar (RF-030).
  revealDocument(organizationId: string, entityType: 'customer' | 'driver', entityId: string, document: 'cpf' | 'cnh'): Promise<RegistryOutcome<string>> {
    return this.command(organizationId, 'reveal_document', { entity_type: entityType, entity_id: entityId, document }, (payload) =>
      (payload.code === 'REVEALED' && typeof payload.value === 'string' ? payload.value : null));
  }
  // ----- Inativação e reativação (US6): nada é apagado; a cascata é atômica no servidor -----

  previewCustomerInactivation(organizationId: string, customerId: string): Promise<RegistryOutcome<CascadeCounts>> {
    return this.query(organizationId, 'preview_customer_inactivation', { customer_id: customerId }, toCounts);
  }

  previewSiteInactivation(organizationId: string, siteId: string): Promise<RegistryOutcome<CascadeCounts>> {
    return this.query(organizationId, 'preview_site_inactivation', { site_id: siteId }, toCounts);
  }

  inactivateCustomer(organizationId: string, customerId: string, justification: string, expected: CascadeCounts): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'inactivate_customer', { customer_id: customerId, justification, expected_counts: { sites: expected.sites, geofences: expected.geofences } }, toChanged('INACTIVATED'));
  }

  reactivateCustomer(organizationId: string, customerId: string, justification: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'reactivate_customer', { customer_id: customerId, justification }, toChanged('REACTIVATED'));
  }

  inactivateSite(organizationId: string, siteId: string, justification: string, expected: CascadeCounts): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'inactivate_site', { site_id: siteId, justification, expected_counts: { geofences: expected.geofences } }, toChanged('INACTIVATED'));
  }

  reactivateSite(organizationId: string, siteId: string, justification: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'reactivate_site', { site_id: siteId, justification }, toChanged('REACTIVATED'));
  }

  inactivateGeofence(organizationId: string, geofenceId: string, justification: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'inactivate_geofence', { geofence_id: geofenceId, justification }, toChanged('INACTIVATED'));
  }

  reactivateGeofence(organizationId: string, geofenceId: string, justification: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'reactivate_geofence', { geofence_id: geofenceId, justification }, toChanged('REACTIVATED'));
  }

  inactivateDriver(organizationId: string, driverId: string, justification: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'inactivate_driver', { driver_id: driverId, justification }, toChanged('INACTIVATED'));
  }

  reactivateDriver(organizationId: string, driverId: string, justification: string): Promise<RegistryOutcome<UpdatedRecord>> {
    return this.command(organizationId, 'reactivate_driver', { driver_id: driverId, justification }, toChanged('REACTIVATED'));
  }
  // ----- Histórico (US7): somente leitura, paginado por sequência, sem dado pessoal -----

  history(organizationId: string, entityType: 'customer' | 'site' | 'geofence' | 'vehicle' | 'driver', entityId: string, filters: HistoryFilters): Promise<RegistryOutcome<RegistryHistoryPage>> {
    return this.query(organizationId, 'history', {
      entity_type: entityType, entity_id: entityId, event_type: filters.eventType || undefined, from: filters.from || undefined, to: filters.to || undefined,
      order: filters.order, cursor: filters.cursor ?? undefined, limit: filters.limit,
    }, toRegistryHistory);
  }
  // ----- Anonimização (US8): irreversível, exige MFA no servidor e confirmação explícita (RF-055, RF-056) -----

  anonymizeDriver(organizationId: string, driverId: string, expectedVersion: number, request: AnonymizationRequest): Promise<RegistryOutcome<AnonymizedResult>> {
    return this.command(organizationId, 'anonymize_driver', { driver_id: driverId, expected_version: expectedVersion, ...toAnonymizationBody(request) }, toAnonymized);
  }

  anonymizeCustomer(organizationId: string, customerId: string, expectedVersion: number, request: AnonymizationRequest): Promise<RegistryOutcome<AnonymizedResult>> {
    return this.command(organizationId, 'anonymize_customer', { customer_id: customerId, expected_version: expectedVersion, ...toAnonymizationBody(request) }, toAnonymized);
  }

  anonymizeContact(organizationId: string, contactId: string, request: AnonymizationRequest): Promise<RegistryOutcome<AnonymizedResult>> {
    return this.command(organizationId, 'anonymize_contact', { contact_id: contactId, ...toAnonymizationBody(request) }, toAnonymized);
  }
}
