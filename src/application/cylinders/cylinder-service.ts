import { normalizeIdentifier } from '@/domain/cylinders/identifier';
import type { CustodyStatus } from '@/domain/trips/trip-vocabulary';
import type {
  CapacityUnit, Classification, CylinderEventType, HydrostaticResult, IdentifierKind, InactivationReason,
} from '@/domain/cylinders/cylinder-types';
import type {
  CustodySiteView, CylinderDetail, CylinderDetailData, CylinderListItem, CylinderListPage, CylinderListQuery, CylinderTypeView, HistoryEvent,
  HistoryPage, HistoryQuery, IdentifierView, LookupResult, StockInResult, TestView,
} from './cylinder-views';

export interface CylinderTransport {
  call(fn: 'query-cylinders' | 'manage-cylinders', body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type CylinderFailureKind =
  | 'offline' | 'unavailable' | 'unknown' | 'access_denied' | 'mfa_required' | 'not_found' | 'invalid' | 'justification_required'
  | 'serial_conflict' | 'identifier_conflict' | 'identifier_unavailable' | 'version_conflict' | 'cylinder_inactive'
  | 'already_in_stock' | 'already_inactive' | 'idempotency_conflict' | 'cylinder_in_trip';

export interface CylinderFailure {
  kind: CylinderFailureKind;
  // Erros de validação do servidor por campo (nomes do contrato, em snake_case).
  fields?: Record<string, string>;
  // Cilindro que já usa o número de série ou o identificador (somente da própria organização).
  ownerCylinderId?: string;
  // Leitura de identificador desativado: a quem pertencia.
  deactivatedOwner?: { id: string; serialNumber: string };
  // Cilindro em viagem aberta (Spec 008, RF-024a): a viagem que o mantém.
  trip?: { id: string; number: number };
}

export type CylinderOutcome<T> = { kind: 'success'; value: T } | CylinderFailure;

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const FAILURES: Record<string, CylinderFailureKind> = {
  AUTH_REQUIRED: 'access_denied', ACCESS_DENIED: 'access_denied', MFA_REQUIRED: 'mfa_required', NOT_FOUND: 'not_found',
  VALIDATION_FAILED: 'invalid', JUSTIFICATION_REQUIRED: 'justification_required', SERIAL_CONFLICT: 'serial_conflict',
  IDENTIFIER_CONFLICT: 'identifier_conflict', IDENTIFIER_UNAVAILABLE: 'identifier_unavailable', VERSION_CONFLICT: 'version_conflict',
  CYLINDER_INACTIVE: 'cylinder_inactive', ALREADY_IN_STOCK: 'already_in_stock', ALREADY_INACTIVE: 'already_inactive',
  IDEMPOTENCY_PAYLOAD_CONFLICT: 'idempotency_conflict', CYLINDER_IN_TRIP: 'cylinder_in_trip',
};

function toType(value: unknown): CylinderTypeView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.gas !== 'string' || typeof value.capacity_unit !== 'string') return null;
  const capacity = num(value.capacity_value);
  if (capacity === null) return null;
  return {
    id: value.id, gas: value.gas, capacityValue: capacity, capacityUnit: value.capacity_unit as CapacityUnit,
    classification: value.classification as Classification, active: value.active !== false,
  };
}

const CUSTODY: readonly CustodyStatus[] = ['in_organization', 'in_transit', 'at_customer'];
const toCustody = (value: unknown): CustodyStatus => (CUSTODY.includes(value as CustodyStatus) ? (value as CustodyStatus) : 'in_organization');
function toCustodySite(value: unknown): CustodySiteView | null {
  return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.customer_id === 'string'
    ? { id: value.id, customerId: value.customer_id, name: value.name } : null;
}

function toListItem(value: unknown): CylinderListItem | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.serial_number !== 'string') return null;
  const type = toType(value.type);
  if (!type) return null;
  return {
    id: value.id, serialNumber: value.serial_number, type, status: value.status as CylinderListItem['status'],
    stockStatus: value.stock_status as CylinderListItem['stockStatus'], custodyStatus: toCustody(value.custody_status), custodySite: toCustodySite(value.custody_site), hydroStatus: value.hydro_status as CylinderListItem['hydroStatus'],
    activeIdentifierCount: num(value.active_identifier_count) ?? 0, version: num(value.version) ?? 1,
  };
}

function toDetailData(value: unknown): CylinderDetailData | null {
  const base = toListItem(value);
  if (!base || !isObject(value)) return null;
  return {
    id: base.id, serialNumber: base.serialNumber, type: base.type, status: base.status, stockStatus: base.stockStatus, custodyStatus: base.custodyStatus, custodySite: base.custodySite, version: base.version,
    manufacturer: str(value.manufacturer), manufactureYear: num(value.manufacture_year), workingPressureBar: num(value.working_pressure_bar),
    notes: str(value.notes), inactivationReason: str(value.inactivation_reason) as InactivationReason | null,
    hydroLastResult: str(value.hydro_last_result) as HydrostaticResult | null, hydroNextDueOn: str(value.hydro_next_due_on),
    createdAt: str(value.created_at) ?? '',
  };
}

function toIdentifier(value: unknown): IdentifierView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.value !== 'string') return null;
  return {
    id: value.id, kind: value.kind as IdentifierKind, value: value.value, status: value.status as IdentifierView['status'],
    createdAt: str(value.created_at) ?? '', deactivatedAt: str(value.deactivated_at),
    deactivationJustification: str(value.deactivation_justification), transferred: value.transferred === true,
  };
}

function toTest(value: unknown): TestView | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.performed_on !== 'string') return null;
  return {
    id: value.id, performedOn: value.performed_on, result: value.result as HydrostaticResult, reportNumber: str(value.report_number),
    executor: str(value.executor) ?? '', nextDueOn: str(value.next_due_on), notes: str(value.notes),
    rectifiesTestId: str(value.rectifies_test_id), rectificationJustification: str(value.rectification_justification),
    createdAt: str(value.created_at) ?? '', superseded: value.superseded === true,
  };
}

function toEvent(value: unknown): HistoryEvent | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.event_type !== 'string') return null;
  const sequence = num(value.sequence);
  if (sequence === null) return null;
  return {
    id: value.id, sequence, eventType: value.event_type as CylinderEventType, actorName: str(value.actor_name),
    occurredAt: str(value.occurred_at) ?? '', justification: str(value.justification), data: isObject(value.data) ? value.data : {},
    referencesEventId: str(value.references_event_id),
  };
}

const compact = (body: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== ''));

export interface CylinderFields {
  cylinderTypeId: string; serialNumber: string; manufacturer: string | null; manufactureYear: number | null;
  workingPressureBar: number | null; notes: string | null;
}
export interface TestFields {
  performedOn: string; result: HydrostaticResult; reportNumber: string | null; executor: string; nextDueOn: string | null; notes: string | null;
}

// Consultas e comandos de cilindros pelas Edge Functions query-cylinders e manage-cylinders. Toda escrita exige conexão: sem ela,
// nada é enviado nem guardado (RF-035). Não existe operação de exclusão (RF-005). Falha de rede em comando nunca vira sucesso
// nem exceção: vira `unknown`, e a repetição com a mesma chave não duplica (RF-014).
export class CylinderService {
  constructor(private readonly transport: CylinderTransport, private readonly isOnline: () => boolean = () => true) {}

  private failureOf(response: { status: number; body: unknown }, write: boolean): CylinderFailure {
    const body = isObject(response.body) ? response.body : {};
    const kind = typeof body.code === 'string' ? FAILURES[body.code] : undefined;
    if (!kind || response.status >= 500) return { kind: write ? 'unknown' : 'unavailable' };
    const failure: CylinderFailure = { kind };
    if (Array.isArray(body.fields)) {
      const fields: Record<string, string> = {};
      for (const entry of body.fields) {
        if (isObject(entry) && typeof entry.field === 'string' && typeof entry.message === 'string') fields[entry.field] = entry.message;
      }
      failure.fields = fields;
    }
    if (typeof body.cylinder_id === 'string') failure.ownerCylinderId = body.cylinder_id;
    if (body.deactivated === true && isObject(body.cylinder) && typeof body.cylinder.id === 'string') {
      failure.deactivatedOwner = { id: body.cylinder.id, serialNumber: str(body.cylinder.serial_number) ?? '' };
    }
    if (typeof body.trip_id === 'string' && typeof body.trip_number === 'number') failure.trip = { id: body.trip_id, number: body.trip_number };
    return failure;
  }

  private async run<T>(
    fn: 'query-cylinders' | 'manage-cylinders', write: boolean, body: Record<string, unknown>,
    pick: (payload: Raw) => T | null,
  ): Promise<CylinderOutcome<T>> {
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

  // ----- Consultas -----

  list(organizationId: string, query: CylinderListQuery): Promise<CylinderOutcome<CylinderListPage>> {
    const search = query.search?.trim();
    return this.run('query-cylinders', false, compact({
      operation: 'list', organization_id: organizationId, search: search ? search : undefined, status: query.status,
      stock_status: query.stockStatus, hydro_status: query.hydroStatus, custody: query.custody, cylinder_type_id: query.cylinderTypeId, sort: query.sort,
      cursor: query.cursor, limit: query.limit,
    }), (payload) => {
      if (!Array.isArray(payload.items)) return null;
      return {
        items: payload.items.map(toListItem).filter((item): item is CylinderListItem => item !== null),
        total: num(payload.total) ?? 0, next: str(payload.next),
      };
    });
  }

  get(organizationId: string, cylinderId: string): Promise<CylinderOutcome<CylinderDetail>> {
    return this.run('query-cylinders', false, { operation: 'get', organization_id: organizationId, cylinder_id: cylinderId }, (payload) => {
      const cylinder = toDetailData(payload.cylinder);
      if (!cylinder) return null;
      return {
        cylinder,
        identifiers: (Array.isArray(payload.identifiers) ? payload.identifiers : []).map(toIdentifier).filter((item): item is IdentifierView => item !== null),
        tests: (Array.isArray(payload.tests) ? payload.tests : []).map(toTest).filter((item): item is TestView => item !== null),
        hydroStatus: (str(payload.hydro_status) ?? 'sem_teste') as CylinderDetail['hydroStatus'],
      };
    });
  }

  lookup(organizationId: string, identifierValue: string): Promise<CylinderOutcome<LookupResult>> {
    return this.run('query-cylinders', false,
      { operation: 'lookup', organization_id: organizationId, identifier_value: normalizeIdentifier(identifierValue) }, (payload) => {
        if (!isObject(payload.cylinder) || !isObject(payload.identifier) || typeof payload.cylinder.id !== 'string') return null;
        return {
          cylinder: {
            id: payload.cylinder.id, serialNumber: str(payload.cylinder.serial_number) ?? '',
            status: payload.cylinder.status as LookupResult['cylinder']['status'], stockStatus: payload.cylinder.stock_status as LookupResult['cylinder']['stockStatus'],
            hydroStatus: payload.cylinder.hydro_status as LookupResult['cylinder']['hydroStatus'],
          },
          identifier: { id: str(payload.identifier.id) ?? '', kind: payload.identifier.kind as IdentifierKind, value: str(payload.identifier.value) ?? '' },
        };
      });
  }

  history(organizationId: string, cylinderId: string, query: HistoryQuery): Promise<CylinderOutcome<HistoryPage>> {
    return this.run('query-cylinders', false, compact({
      operation: 'history', organization_id: organizationId, cylinder_id: cylinderId, event_type: query.eventType, from: query.from,
      to: query.to, order: query.order, cursor: query.cursor, limit: query.limit,
    }), (payload) => {
      if (!Array.isArray(payload.events)) return null;
      return { events: payload.events.map(toEvent).filter((event): event is HistoryEvent => event !== null), next: str(payload.next) };
    });
  }

  catalog(organizationId: string): Promise<CylinderOutcome<CylinderTypeView[]>> {
    return this.run('query-cylinders', false, { operation: 'catalog', organization_id: organizationId }, (payload) => {
      if (!Array.isArray(payload.types)) return null;
      return payload.types.map(toType).filter((type): type is CylinderTypeView => type !== null);
    });
  }

  // ----- Comandos -----

  create(organizationId: string, input: CylinderFields & { identifier: { kind: IdentifierKind; value: string } }): Promise<CylinderOutcome<{ cylinderId: string; version: number }>> {
    return this.run('manage-cylinders', true, {
      operation: 'create', organization_id: organizationId, cylinder_type_id: input.cylinderTypeId, serial_number: input.serialNumber,
      manufacturer: input.manufacturer, manufacture_year: input.manufactureYear, working_pressure_bar: input.workingPressureBar,
      notes: input.notes, identifier: { kind: input.identifier.kind, value: normalizeIdentifier(input.identifier.value) },
    }, (payload) => (typeof payload.cylinder_id === 'string' ? { cylinderId: payload.cylinder_id, version: num(payload.version) ?? 1 } : null));
  }

  update(organizationId: string, input: CylinderFields & { cylinderId: string; expectedVersion: number }): Promise<CylinderOutcome<{ version: number }>> {
    return this.run('manage-cylinders', true, {
      operation: 'update', organization_id: organizationId, cylinder_id: input.cylinderId, expected_version: input.expectedVersion,
      cylinder_type_id: input.cylinderTypeId, serial_number: input.serialNumber, manufacturer: input.manufacturer,
      manufacture_year: input.manufactureYear, working_pressure_bar: input.workingPressureBar, notes: input.notes,
    }, (payload) => ({ version: num(payload.version) ?? input.expectedVersion + 1 }));
  }

  saveType(organizationId: string, input: { typeId?: string; gas: string; capacityValue: number; capacityUnit: CapacityUnit; classification: Classification; active?: boolean }): Promise<CylinderOutcome<{ typeId: string | null }>> {
    return this.run('manage-cylinders', true, compact({
      operation: 'save_type', organization_id: organizationId, type_id: input.typeId, gas: input.gas, capacity_value: input.capacityValue,
      capacity_unit: input.capacityUnit, classification: input.classification, active: input.active,
    }), (payload) => ({ typeId: str(payload.type_id) }));
  }

  inactivate(organizationId: string, input: { cylinderId: string; reason: InactivationReason; justification: string }): Promise<CylinderOutcome<{ version: number | null }>> {
    return this.run('manage-cylinders', true, {
      operation: 'inactivate', organization_id: organizationId, cylinder_id: input.cylinderId, reason: input.reason, justification: input.justification.trim(),
    }, (payload) => ({ version: num(payload.version) }));
  }

  reactivate(organizationId: string, input: { cylinderId: string; justification: string }): Promise<CylinderOutcome<{ version: number | null }>> {
    return this.run('manage-cylinders', true, {
      operation: 'reactivate', organization_id: organizationId, cylinder_id: input.cylinderId, justification: input.justification.trim(),
    }, (payload) => ({ version: num(payload.version) }));
  }

  addIdentifier(organizationId: string, input: { cylinderId: string; kind: IdentifierKind; value: string }): Promise<CylinderOutcome<{ identifierId: string | null }>> {
    return this.run('manage-cylinders', true, {
      operation: 'add_identifier', organization_id: organizationId, cylinder_id: input.cylinderId, kind: input.kind, value: normalizeIdentifier(input.value),
    }, (payload) => ({ identifierId: str(payload.identifier_id) }));
  }

  deactivateIdentifier(organizationId: string, input: { identifierId: string; justification: string }): Promise<CylinderOutcome<Record<string, never>>> {
    return this.run('manage-cylinders', true, {
      operation: 'deactivate_identifier', organization_id: organizationId, identifier_id: input.identifierId, justification: input.justification.trim(),
    }, () => ({}));
  }

  transferIdentifier(organizationId: string, input: { value: string; targetCylinderId: string; justification: string }): Promise<CylinderOutcome<{ identifierId: string | null }>> {
    return this.run('manage-cylinders', true, {
      operation: 'transfer_identifier', organization_id: organizationId, value: normalizeIdentifier(input.value),
      target_cylinder_id: input.targetCylinderId, justification: input.justification.trim(), confirmed: true,
    }, (payload) => ({ identifierId: str(payload.identifier_id) }));
  }

  stockIn(organizationId: string, identifierValue: string, operationKey: string): Promise<CylinderOutcome<StockInResult>> {
    return this.run('manage-cylinders', true, {
      operation: 'stock_in', organization_id: organizationId, identifier_value: normalizeIdentifier(identifierValue), operation_key: operationKey,
    }, (payload) => {
      if (!isObject(payload.cylinder) || typeof payload.cylinder.id !== 'string') return null;
      const warning = payload.warning === 'hydro_expired' || payload.warning === 'hydro_rejected' ? payload.warning : null;
      return {
        cylinder: { id: payload.cylinder.id, serialNumber: str(payload.cylinder.serial_number) ?? '', stockStatus: payload.cylinder.stock_status as StockInResult['cylinder']['stockStatus'] },
        replayed: payload.replayed === true, eventSequence: num(payload.event_sequence) ?? 0,
        hydroStatus: (str(payload.hydro_status) ?? 'sem_teste') as StockInResult['hydroStatus'], warning,
      };
    });
  }

  registerTest(organizationId: string, input: TestFields & { cylinderId: string }): Promise<CylinderOutcome<{ testId: string | null }>> {
    return this.run('manage-cylinders', true, {
      operation: 'register_test', organization_id: organizationId, cylinder_id: input.cylinderId, performed_on: input.performedOn,
      result: input.result, report_number: input.reportNumber, executor: input.executor, next_due_on: input.nextDueOn, notes: input.notes,
    }, (payload) => ({ testId: str(payload.test_id) }));
  }

  rectifyTest(organizationId: string, input: TestFields & { testId: string; justification: string }): Promise<CylinderOutcome<{ testId: string | null }>> {
    return this.run('manage-cylinders', true, {
      operation: 'rectify_test', organization_id: organizationId, test_id: input.testId, performed_on: input.performedOn,
      result: input.result, report_number: input.reportNumber, executor: input.executor, next_due_on: input.nextDueOn, notes: input.notes,
      justification: input.justification.trim(),
    }, (payload) => ({ testId: str(payload.test_id) }));
  }
}
