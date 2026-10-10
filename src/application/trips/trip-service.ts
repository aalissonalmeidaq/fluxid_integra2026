import { compact, isObject, num, str, type Raw } from '../registry/registry-service';
import type { CylinderRefusalReason } from '@/domain/trips/trip-vocabulary';
import type { DeliveryFormValue, TripFormValue } from '@/domain/trips/trip-validation';
import {
  toEligibleCylinder, toPage, toTripEventPage, toTripOfCylinder, toTripOfSite, toTripDetail, toTripListItem, toTripOptions,
  type EligibleCylinderView, type Page, type TripEventPage, type TripOfCylinder, type TripOfSite, type TripDetail, type TripListItem, type TripOptions,
} from './trip-views';

// Serviço das viagens da Fase 4 sobre o transporte das Edge Functions `query-trips` e `manage-trips`. Esqueleto da Fundação: o
// mapeamento dos códigos do servidor para estados de tela (contracts/operacoes-servidor.md) e os executores `query` e `command`, que
// cada história usa para montar suas operações tipadas. O serviço nunca guarda resposta em armazenamento local e, sem conexão,
// nem chama o servidor: toda escrita exige conexão e nunca é enfileirada (a fila é da Fase 5).

export type TripFunction = 'query-trips' | 'manage-trips';

export interface TripTransport {
  call(fn: TripFunction, body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type TripFailureKind =
  | 'offline' | 'unavailable' | 'unknown' | 'session_expired' | 'access_denied' | 'mfa_required' | 'not_found' | 'invalid' | 'justification_required'
  | 'version_conflict' | 'cylinder_reserved' | 'cylinder_not_eligible' | 'capacity_exceeded' | 'parent_inactive' | 'driver_license_expired'
  | 'resource_busy' | 'invalid_transition' | 'items_pending' | 'stops_open' | 'trip_closed' | 'stop_closed' | 'request_reused';

export interface TripFailure {
  kind: TripFailureKind;
  // Erros de validação do servidor por campo (nomes do contrato, em snake_case).
  fields?: Record<string, string>;
  // Viagem que causou o conflito (`cylinder_reserved`, `resource_busy`).
  trip?: { id: string; number: number };
  // `vehicle` ou `driver` (`resource_busy`) e o cadastro inativo (`parent_inactive`).
  entity?: string;
  entityId?: string;
  // Cilindro recusado e o motivo (`cylinder_not_eligible`).
  cylinderId?: string;
  reason?: CylinderRefusalReason;
  capacity?: number;
  requested?: number;
  // Transição que não existe (`invalid_transition`).
  from?: string;
  to?: string;
  itemIds?: string[];
  stopIds?: string[];
}

export type TripOutcome<T> = { kind: 'success'; value: T } | TripFailure;

export interface TripFilters {
  search?: string;
  status?: 'open' | 'planned' | 'loading' | 'in_progress' | 'completed' | 'cancelled' | 'all';
  from?: string;
  to?: string;
  vehicleId?: string;
  driverId?: string;
  customerId?: string;
  custody?: 'in_organization' | 'in_transit' | 'at_customer';
  sort?: 'number_desc' | 'number_asc' | 'date_desc' | 'date_asc';
  cursor?: string | null;
  limit?: number;
}
export interface EligibleFilters { search?: string; cylinderTypeId?: string; cursor?: string | null; limit?: number }
export interface HistoryFilters { eventType?: string; from?: string; to?: string; order?: 'asc' | 'desc'; cursor?: string | null; limit?: number }
export interface ArrivedStop { outOfOrder: boolean }
export interface RegisteredDelivery { deliveryId: string; stopStatus: 'delivered' | 'with_divergence'; outsideGeofence: boolean | null }
export interface UnlockResult { exceptional: boolean }
export interface CancelledTrip { version: number; released: number; inTransit: number }
export interface ItemCounts { checked: number; total: number }
export interface CreatedTrip { tripId: string; number: number; version: number }
export interface UpdatedTrip { version: number }

const toStopsBody = (value: TripFormValue): Raw[] =>
  value.stops.map((stop) => ({ ...(stop.id ? { id: stop.id } : {}), site_id: stop.siteId, cylinder_ids: stop.cylinderIds }));
const toPlanBody = (value: TripFormValue): Raw => ({
  planned_date: value.plannedDate, vehicle_id: value.vehicleId, driver_id: value.driverId, notes: value.notes, stops: toStopsBody(value),
});

const FAILURES: Record<string, TripFailureKind> = {
  AUTH_REQUIRED: 'session_expired', ACCESS_DENIED: 'access_denied', MFA_REQUIRED: 'mfa_required', NOT_FOUND: 'not_found',
  VALIDATION_FAILED: 'invalid', JUSTIFICATION_REQUIRED: 'justification_required', VERSION_CONFLICT: 'version_conflict',
  CYLINDER_RESERVED: 'cylinder_reserved', CYLINDER_NOT_ELIGIBLE: 'cylinder_not_eligible', CAPACITY_EXCEEDED: 'capacity_exceeded',
  PARENT_INACTIVE: 'parent_inactive', DRIVER_LICENSE_EXPIRED: 'driver_license_expired', RESOURCE_BUSY: 'resource_busy',
  INVALID_TRANSITION: 'invalid_transition', ITEMS_PENDING: 'items_pending', STOPS_OPEN: 'stops_open', TRIP_CLOSED: 'trip_closed',
  STOP_CLOSED: 'stop_closed', REQUEST_REUSED: 'request_reused',
};

const STRING_LIST = (value: unknown): string[] | undefined =>
  (Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? (value as string[]) : undefined);

// Identificador de um envio. A tela gera um por tentativa e reaproveita o mesmo na repetição do mesmo envio (duplo clique, queda
// de rede, resultado desconhecido): o servidor devolve o resultado gravado e não duplica nada.
export const newRequestId = (): string => crypto.randomUUID();

export class TripService {
  constructor(protected readonly transport: TripTransport, protected readonly isOnline: () => boolean = () => true) {}

  protected failureOf(response: { status: number; body: unknown }, write: boolean): TripFailure {
    const body = isObject(response.body) ? response.body : {};
    // Sem sessão válida nada foi gravado: a tela leva a pessoa a entrar de novo (RF-029, história 7).
    if (response.status === 401) return { kind: 'session_expired' };
    const kind = typeof body.code === 'string' ? FAILURES[body.code] : undefined;
    if (!kind || response.status >= 500) return { kind: write ? 'unknown' : 'unavailable' };
    const failure: TripFailure = { kind };
    if (Array.isArray(body.fields)) {
      const fields: Record<string, string> = {};
      for (const entry of body.fields) {
        if (isObject(entry) && typeof entry.field === 'string' && typeof entry.message === 'string') fields[entry.field] = entry.message;
      }
      failure.fields = fields;
    }
    const tripId = str(body.trip_id);
    const tripNumber = num(body.trip_number);
    if (tripId !== null && tripNumber !== null) failure.trip = { id: tripId, number: tripNumber };
    const entity = str(body.entity);
    if (entity !== null) failure.entity = entity;
    const entityId = str(body.entity_id);
    if (entityId !== null) failure.entityId = entityId;
    const cylinderId = str(body.cylinder_id);
    if (cylinderId !== null) failure.cylinderId = cylinderId;
    if (typeof body.reason === 'string') failure.reason = body.reason as CylinderRefusalReason;
    const capacity = num(body.capacity);
    if (capacity !== null) failure.capacity = capacity;
    const requested = num(body.requested);
    if (requested !== null) failure.requested = requested;
    const from = str(body.from);
    if (from !== null) failure.from = from;
    const to = str(body.to);
    if (to !== null) failure.to = to;
    const itemIds = STRING_LIST(body.item_ids);
    if (itemIds) failure.itemIds = itemIds;
    const stopIds = STRING_LIST(body.stop_ids);
    if (stopIds) failure.stopIds = stopIds;
    return failure;
  }

  // Executa uma chamada e converte a resposta em sucesso tipado (por `pick`) ou em estado de falha de tela. Resposta 2xx que o
  // `pick` não reconhece é tratada como falha desconhecida (escrita) ou indisponível (leitura), nunca como sucesso.
  protected async run<T>(fn: TripFunction, write: boolean, body: Raw, pick: (payload: Raw) => T | null): Promise<TripOutcome<T>> {
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

  query<T>(organizationId: string, operation: string, params: Raw, pick: (payload: Raw) => T | null): Promise<TripOutcome<T>> {
    return this.run('query-trips', false, compact({ operation, organization_id: organizationId, ...params }), pick);
  }

  // Todo comando leva um `request_id`; sem um informado, o serviço gera um novo para esta tentativa.
  command<T>(organizationId: string, operation: string, params: Raw, pick: (payload: Raw) => T | null, requestId: string = newRequestId()): Promise<TripOutcome<T>> {
    return this.run('manage-trips', true, compact({ operation, organization_id: organizationId, request_id: requestId, ...params }), pick);
  }

  // ----- Planejamento e consulta (US1) -----

  listTrips(organizationId: string, filters: TripFilters = {}): Promise<TripOutcome<Page<TripListItem>>> {
    return this.query(organizationId, 'list_trips', {
      search: filters.search?.trim() || undefined, status: filters.status, from: filters.from || undefined, to: filters.to || undefined, vehicle_id: filters.vehicleId || undefined,
      driver_id: filters.driverId || undefined, customer_id: filters.customerId || undefined, custody: filters.custody, sort: filters.sort, cursor: filters.cursor ?? undefined, limit: filters.limit,
    }, (payload) => toPage(payload, 'items', toTripListItem));
  }

  getTrip(organizationId: string, tripId: string): Promise<TripOutcome<TripDetail>> {
    return this.query(organizationId, 'get_trip', { trip_id: tripId }, toTripDetail);
  }

  // ----- Histórico e consultas cruzadas (US6) -----

  tripHistory(organizationId: string, tripId: string, filters: HistoryFilters = {}): Promise<TripOutcome<TripEventPage>> {
    return this.query(organizationId, 'trip_history', {
      trip_id: tripId, event_type: filters.eventType || undefined, from: filters.from || undefined, to: filters.to || undefined, order: filters.order,
      cursor: filters.cursor ?? undefined, limit: filters.limit,
    }, toTripEventPage);
  }

  tripsOfCylinder(organizationId: string, cylinderId: string, page: { cursor?: string | null; limit?: number } = {}): Promise<TripOutcome<{ items: TripOfCylinder[]; next: string | null }>> {
    return this.query(organizationId, 'trips_of_cylinder', { cylinder_id: cylinderId, cursor: page.cursor ?? undefined, limit: page.limit }, (payload) => {
      const result = toPage(payload, 'items', toTripOfCylinder);
      return result ? { items: result.items, next: result.next } : null;
    });
  }

  tripsOfSite(organizationId: string, siteId: string, page: { cursor?: string | null; limit?: number } = {}): Promise<TripOutcome<{ items: TripOfSite[]; next: string | null }>> {
    return this.query(organizationId, 'trips_of_site', { site_id: siteId, cursor: page.cursor ?? undefined, limit: page.limit }, (payload) => {
      const result = toPage(payload, 'items', toTripOfSite);
      return result ? { items: result.items, next: result.next } : null;
    });
  }

  tripOptions(organizationId: string, search?: string): Promise<TripOutcome<TripOptions>> {
    return this.query(organizationId, 'trip_options', { search: search?.trim() || undefined }, toTripOptions);
  }

  listEligibleCylinders(organizationId: string, filters: EligibleFilters = {}): Promise<TripOutcome<{ items: EligibleCylinderView[]; next: string | null }>> {
    return this.query(organizationId, 'list_eligible_cylinders', {
      search: filters.search?.trim() || undefined, cylinder_type_id: filters.cylinderTypeId || undefined, cursor: filters.cursor ?? undefined, limit: filters.limit,
    }, (payload) => {
      const page = toPage(payload, 'items', toEligibleCylinder);
      return page ? { items: page.items, next: page.next } : null;
    });
  }

  createTrip(organizationId: string, value: TripFormValue, requestId?: string): Promise<TripOutcome<CreatedTrip>> {
    return this.command(organizationId, 'create_trip', toPlanBody(value), (payload) => {
      const tripId = str(payload.trip_id);
      const number = num(payload.number);
      const version = num(payload.version);
      return payload.code === 'CREATED' && tripId !== null && number !== null && version !== null ? { tripId, number, version } : null;
    }, requestId);
  }

  updateTrip(organizationId: string, tripId: string, expectedVersion: number, value: TripFormValue, requestId?: string): Promise<TripOutcome<UpdatedTrip>> {
    return this.command(organizationId, 'update_trip', { trip_id: tripId, expected_version: expectedVersion, ...toPlanBody(value) }, (payload) => {
      const version = num(payload.version);
      return payload.code === 'UPDATED' && version !== null ? { version } : null;
    }, requestId);
  }

  // ----- Carregamento e início (US2) -----

  private transition(organizationId: string, operation: string, code: string, tripId: string, version: number, requestId?: string): Promise<TripOutcome<UpdatedTrip>> {
    return this.command(organizationId, operation, { trip_id: tripId, expected_version: version }, (payload) => {
      const next = num(payload.version);
      return payload.code === code && next !== null ? { version: next } : null;
    }, requestId);
  }

  startLoading(organizationId: string, tripId: string, expectedVersion: number, requestId?: string): Promise<TripOutcome<UpdatedTrip>> {
    return this.transition(organizationId, 'start_loading', 'LOADING', tripId, expectedVersion, requestId);
  }

  revertLoading(organizationId: string, tripId: string, expectedVersion: number, requestId?: string): Promise<TripOutcome<UpdatedTrip>> {
    return this.transition(organizationId, 'revert_loading', 'REVERTED', tripId, expectedVersion, requestId);
  }

  startTrip(organizationId: string, tripId: string, expectedVersion: number, requestId?: string): Promise<TripOutcome<UpdatedTrip>> {
    return this.transition(organizationId, 'start_trip', 'STARTED', tripId, expectedVersion, requestId);
  }

  private itemCommand(organizationId: string, operation: string, code: string, tripId: string, itemId: string, requestId?: string, extra: Raw = {}): Promise<TripOutcome<ItemCounts>> {
    return this.command(organizationId, operation, { trip_id: tripId, item_id: itemId, ...extra }, (payload) => {
      if (payload.code !== code) return null;
      return { checked: num(payload.checked) ?? 0, total: num(payload.total) ?? 0 };
    }, requestId);
  }

  checkItem(organizationId: string, tripId: string, itemId: string, requestId?: string): Promise<TripOutcome<ItemCounts>> {
    return this.itemCommand(organizationId, 'check_item', 'CHECKED', tripId, itemId, requestId);
  }

  uncheckItem(organizationId: string, tripId: string, itemId: string, requestId?: string): Promise<TripOutcome<ItemCounts>> {
    return this.itemCommand(organizationId, 'uncheck_item', 'UNCHECKED', tripId, itemId, requestId);
  }

  // Retirada com exceção: exige trip.exception e a justificativa (5 a 500 caracteres).
  removeItem(organizationId: string, tripId: string, itemId: string, justification: string, requestId?: string): Promise<TripOutcome<ItemCounts>> {
    return this.itemCommand(organizationId, 'remove_item', 'REMOVED', tripId, itemId, requestId, { justification });
  }

  // ----- Chegada e entrega (US3) -----

  arriveStop(organizationId: string, tripId: string, stopId: string, requestId?: string): Promise<TripOutcome<ArrivedStop>> {
    return this.command(organizationId, 'arrive_stop', { trip_id: tripId, stop_id: stopId }, (payload) => (payload.code === 'ARRIVED' ? { outOfOrder: payload.out_of_order === true } : null), requestId);
  }

  // Entrega por parada inteira. Com `supersedesId`, é a correção de um registro anterior (novo registro; o original fica intacto).
  // O nome do recebedor segue só no corpo do pedido: o serviço não o guarda nem o repete em lugar algum.
  registerDelivery(organizationId: string, tripId: string, stopId: string, value: DeliveryFormValue, supersedesId?: string, requestId?: string): Promise<TripOutcome<RegisteredDelivery>> {
    return this.command(organizationId, 'register_delivery', {
      trip_id: tripId, stop_id: stopId, delivered_at: value.deliveredAt, recipient_name: value.recipientName, recipient_role: value.recipientRole,
      latitude: value.latitude, longitude: value.longitude, at_site_address: value.atSiteAddress,
      results: value.results.map((result) => (result.delivered ? { item_id: result.itemId, delivered: true } : { item_id: result.itemId, delivered: false, reason: result.reason })),
      supersedes_id: supersedesId,
    }, (payload) => {
      const deliveryId = str(payload.delivery_id);
      const stopStatus = payload.stop_status;
      if (payload.code !== 'DELIVERED' || deliveryId === null || (stopStatus !== 'delivered' && stopStatus !== 'with_divergence')) return null;
      return { deliveryId, stopStatus, outsideGeofence: typeof payload.outside_geofence === 'boolean' ? payload.outside_geofence : null };
    }, requestId);
  }

  // ----- Desbloqueio (US4) -----

  // Registra o desbloqueio de um cilindro. O normal (item entregue) dispensa a justificativa; o excepcional (item ainda não entregue)
  // exige trip.exception, segundo fator e justificativa, e o servidor responde MFA_REQUIRED sem ele. Não existe operação de refazer o bloqueio.
  registerUnlock(organizationId: string, tripId: string, itemId: string, justification: string | null, requestId?: string): Promise<TripOutcome<UnlockResult>> {
    return this.command(organizationId, 'register_unlock', { trip_id: tripId, item_id: itemId, justification }, (payload) => (payload.code === 'UNLOCKED' ? { exceptional: payload.exceptional === true } : null), requestId);
  }

  // ----- Encerramento (US5) -----

  // Conclui a viagem: todas as paradas encerradas e cada cilindro não entregue com uma decisão (entregue por correção ou devolvido).
  completeTrip(organizationId: string, tripId: string, expectedVersion: number, requestId?: string): Promise<TripOutcome<UpdatedTrip>> {
    return this.transition(organizationId, 'complete_trip', 'COMPLETED', tripId, expectedVersion, requestId);
  }

  // Cancela com justificativa. Planejada ou carregando libera as reservas; em andamento exige também trip.exception e mantém em trânsito
  // o que já saiu, até um registro de retorno ao estoque ou de entrega tardia.
  cancelTrip(organizationId: string, tripId: string, expectedVersion: number, justification: string, requestId?: string): Promise<TripOutcome<CancelledTrip>> {
    return this.command(organizationId, 'cancel_trip', { trip_id: tripId, expected_version: expectedVersion, justification }, (payload) => {
      const version = num(payload.version);
      return payload.code === 'CANCELLED' && version !== null ? { version, released: num(payload.released) ?? 0, inTransit: num(payload.in_transit) ?? 0 } : null;
    }, requestId);
  }

  // Devolve ao estoque um cilindro em trânsito ou não entregue (exceção, com justificativa).
  returnItem(organizationId: string, tripId: string, itemId: string, justification: string, requestId?: string): Promise<TripOutcome<true>> {
    return this.command(organizationId, 'return_item', { trip_id: tripId, item_id: itemId, justification }, (payload) => (payload.code === 'RETURNED' ? true : null), requestId);
  }
}
