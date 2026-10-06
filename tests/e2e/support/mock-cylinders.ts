import { addCivilDays, daysBetween, todayInSaoPaulo } from '../../../src/domain/cylinders/hydrostatic-status';
// Backend simulado das funções query-cylinders e manage-cylinders (Spec 006) para os E2E. Reproduz o contrato de
// specs/006-cilindros-e-estoque/contracts/operacoes-servidor.md em memória: isolamento por organização, permissões,
// conflitos, idempotência da entrada e histórico com sequência. As regras de banco de verdade são provadas nas suítes pgTAP e `.live`.

type Json = Record<string, unknown>;
export type Reply = { status: number; json: Json };

const ORG_A = '20000000-0000-0000-0000-00000000000a';
const ORG_B = '20000000-0000-0000-0000-00000000000b';
const ACTOR_NAME = 'Administrador A';

interface MockType { id: string; organization_id: string; gas: string; capacity_value: number; capacity_unit: string; classification: string; active: boolean }
interface MockCylinder {
  id: string; organization_id: string; type_id: string; serial_number: string; manufacturer: string | null; manufacture_year: number | null;
  working_pressure_bar: number | null; notes: string | null; status: 'active' | 'inactive'; inactivation_reason: string | null;
  stock_status: 'in_stock' | 'out_of_stock'; hydro_last_result: string | null; hydro_next_due_on: string | null; version: number; created_at: string;
}
interface MockIdentifier { id: string; organization_id: string; cylinder_id: string; kind: string; value: string; status: 'active' | 'deactivated'; created_at: string; deactivated_at: string | null; deactivation_justification: string | null; transferred: boolean }
interface MockTest { id: string; organization_id: string; cylinder_id: string; performed_on: string; result: string; report_number: string | null; executor: string; next_due_on: string | null; notes: string | null; rectifies_test_id: string | null; rectification_justification: string | null; created_at: string }
interface MockEvent { id: string; organization_id: string; cylinder_id: string; sequence: number; event_type: string; actor_name: string; occurred_at: string; justification: string | null; data: Json; references_event_id: string | null }

const uuid = (prefix: string, n: number): string => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = (): string => todayInSaoPaulo();
const addDays = (days: number): string => addCivilDays(today(), days);
const daysFromToday = (date: string): number => daysBetween(today(), date);

export function hydroStatus(last: string | null, next: string | null): string {
  if (last === null) return 'sem_teste';
  if (last === 'rejected') return 'reprovado';
  if (next === null) return 'sem_teste';
  const days = daysFromToday(next);
  return days < 0 ? 'vencido' : days <= 30 ? 'a_vencer' : 'em_dia';
}

export class CylinderMock {
  types: MockType[] = [
    { id: uuid('71', 1), organization_id: ORG_A, gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l', classification: 'medicinal', active: true },
    { id: uuid('71', 2), organization_id: ORG_A, gas: 'Nitrogênio', capacity_value: 40, capacity_unit: 'l', classification: 'industrial', active: true },
    { id: uuid('71', 3), organization_id: ORG_B, gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l', classification: 'medicinal', active: true },
  ];
  cylinders: MockCylinder[] = [];
  identifiers: MockIdentifier[] = [];
  tests: MockTest[] = [];
  events: MockEvent[] = [];
  private ledger = new Map<string, { value: string; payload: Json }>();
  private counter = 1000;
  // Relógio dos eventos novos; a regressão visual fixa o instante para as capturas não variarem entre execuções.
  now: () => Date = () => new Date();
  // Faz a próxima chamada de comando perder a resposta (rede caiu depois de gravar), para exercitar o estado desconhecido.
  loseNextStockInResponse = false;

  constructor(total = 40) {
    for (let n = 1; n <= total; n += 1) {
      const id = uuid('72', n);
      const inactive = n % 15 === 0;
      this.cylinders.push({
        id, organization_id: ORG_A, type_id: n % 2 === 0 ? uuid('71', 2) : uuid('71', 1), serial_number: `CIL-${String(n).padStart(3, '0')}`,
        manufacturer: 'Fábrica Sintética', manufacture_year: 2020, working_pressure_bar: 200, notes: null,
        status: inactive ? 'inactive' : 'active', inactivation_reason: inactive ? 'lost' : null, stock_status: !inactive && n <= 5 ? 'in_stock' : 'out_of_stock',
        hydro_last_result: n % 7 === 0 ? 'rejected' : n % 5 === 0 ? 'approved' : n % 3 === 0 ? 'approved' : null,
        hydro_next_due_on: n % 7 === 0 ? null : n % 5 === 0 ? addDays(-3) : n % 3 === 0 ? addDays(200) : null, version: 1, created_at: '2026-10-01T10:00:00Z',
      });
      this.identifiers.push({ id: uuid('73', n), organization_id: ORG_A, cylinder_id: id, kind: 'qr_code', value: `QR-${String(n).padStart(3, '0')}`, status: 'active', created_at: '2026-10-01T10:00:00Z', deactivated_at: null, deactivation_justification: null, transferred: false });
      this.addEvent(ORG_A, id, 'cylinder_created', null, { serial_number: `CIL-${String(n).padStart(3, '0')}` });
      this.events[this.events.length - 1]!.occurred_at = '2026-10-01T10:00:00.000Z';
      const last = this.cylinders[this.cylinders.length - 1]!;
      if (last.hydro_last_result !== null) {
        // O último resultado do cilindro vem de um teste real, para o detalhe mostrar a mesma situação da lista.
        this.tests.push({ id: uuid('74', n), organization_id: ORG_A, cylinder_id: id, performed_on: '2026-09-01', result: last.hydro_last_result, report_number: `L-${n}`, executor: 'Laboratório Sintético', next_due_on: last.hydro_next_due_on, notes: null, rectifies_test_id: null, rectification_justification: null, created_at: '2026-09-01T10:00:00.000Z' });
      }
    }
    // Identificador desativado, disponível para a transferência (CIL-006 -> qualquer outro).
    this.identifiers.push({ id: uuid('73', 900), organization_id: ORG_A, cylinder_id: uuid('72', 6), kind: 'nfc_tag', value: 'NFC-ANTIGA', status: 'deactivated', created_at: '2026-09-01T10:00:00Z', deactivated_at: '2026-09-20T10:00:00Z', deactivation_justification: 'Etiqueta perdida', transferred: false });
    // Tenant B: três cilindros, um com o mesmo valor de identificador do Tenant A (QR-001).
    for (let n = 1; n <= 3; n += 1) {
      const id = uuid('72', 500 + n);
      this.cylinders.push({ id, organization_id: ORG_B, type_id: uuid('71', 3), serial_number: `B-${n}`, manufacturer: null, manufacture_year: null, working_pressure_bar: null, notes: null, status: 'active', inactivation_reason: null, stock_status: 'out_of_stock', hydro_last_result: null, hydro_next_due_on: null, version: 1, created_at: '2026-10-01T10:00:00Z' });
      this.identifiers.push({ id: uuid('73', 500 + n), organization_id: ORG_B, cylinder_id: id, kind: 'qr_code', value: n === 1 ? 'QR-001' : `QR-B-${n}`, status: 'active', created_at: '2026-10-01T10:00:00Z', deactivated_at: null, deactivation_justification: null, transferred: false });
    }
  }

  private id(prefix: string): string { this.counter += 1; return uuid(prefix, this.counter); }

  private addEvent(org: string, cylinder: string, type: string, justification: string | null, data: Json = {}, references: string | null = null): number {
    const sequence = this.events.filter((event) => event.cylinder_id === cylinder).length + 1;
    this.events.push({ id: this.id('75'), organization_id: org, cylinder_id: cylinder, sequence, event_type: type, actor_name: ACTOR_NAME, occurred_at: this.now().toISOString(), justification, data, references_event_id: references });
    return sequence;
  }

  private typeJson(typeId: string): Json {
    const type = this.types.find((candidate) => candidate.id === typeId)!;
    return { id: type.id, gas: type.gas, capacity_value: type.capacity_value, capacity_unit: type.capacity_unit, classification: type.classification, active: type.active };
  }

  private item(c: MockCylinder): Json {
    return {
      id: c.id, serial_number: c.serial_number, type: this.typeJson(c.type_id), status: c.status, stock_status: c.stock_status,
      hydro_status: hydroStatus(c.hydro_last_result, c.hydro_next_due_on),
      active_identifier_count: this.identifiers.filter((i) => i.cylinder_id === c.id && i.status === 'active').length, version: c.version,
    };
  }

  private find(org: string, id: unknown): MockCylinder | undefined {
    return this.cylinders.find((c) => c.id === id && c.organization_id === org);
  }

  handle(kind: 'query' | 'manage', body: Json, can: (organizationId: string, code: string) => boolean): Reply {
    const org = String(body.organization_id ?? '');
    const operation = String(body.operation ?? '');
    const need: Record<string, string> = {
      list: 'cylinder.read', get: 'cylinder.read', lookup: 'cylinder.read', catalog: 'cylinder.read', history: 'cylinder.history',
      create: 'cylinder.write', update: 'cylinder.write', save_type: 'cylinder.write', inactivate: 'cylinder.deactivate', reactivate: 'cylinder.deactivate',
      add_identifier: 'cylinder.identifier', deactivate_identifier: 'cylinder.identifier', transfer_identifier: 'cylinder.identifier',
      stock_in: 'cylinder.stock_in', register_test: 'cylinder.test', rectify_test: 'cylinder.test',
    };
    const queryOps = ['list', 'get', 'lookup', 'catalog', 'history'];
    if (!(operation in need) || queryOps.includes(operation) !== (kind === 'query')) return { status: 400, json: { code: 'VALIDATION_FAILED' } };
    if (!can(org, need[operation]!)) return { status: 403, json: { code: 'ACCESS_DENIED' } };
    const handlers: Record<string, (organizationId: string, payload: Json) => Reply> = {
      list: (o, b) => this.op_list(o, b), get: (o, b) => this.op_get(o, b), lookup: (o, b) => this.op_lookup(o, b), catalog: (o) => this.op_catalog(o),
      history: (o, b) => this.op_history(o, b), create: (o, b) => this.op_create(o, b), update: (o, b) => this.op_update(o, b), save_type: (o, b) => this.op_save_type(o, b),
      inactivate: (o, b) => this.op_inactivate(o, b), reactivate: (o, b) => this.op_reactivate(o, b), add_identifier: (o, b) => this.op_add_identifier(o, b),
      deactivate_identifier: (o, b) => this.op_deactivate_identifier(o, b), transfer_identifier: (o, b) => this.op_transfer_identifier(o, b),
      stock_in: (o, b) => this.op_stock_in(o, b), register_test: (o, b) => this.op_register_test(o, b), rectify_test: (o, b) => this.op_rectify_test(o, b),
    };
    return handlers[operation]!(org, body);
  }

  // ----- consultas -----

  private op_catalog(org: string): Reply { return { status: 200, json: { code: 'LISTED', types: this.types.filter((t) => t.organization_id === org).map((t) => this.typeJson(t.id)) } }; }

  private op_list(org: string, body: Json): Reply {
    const status = String(body.status ?? 'active');
    const search = String(body.search ?? '').trim().toUpperCase();
    const desc = body.sort === 'serial_desc';
    let rows = this.cylinders.filter((c) => c.organization_id === org && (status === 'all' || c.status === status));
    if (body.stock_status) rows = rows.filter((c) => c.stock_status === body.stock_status);
    if (body.hydro_status) rows = rows.filter((c) => hydroStatus(c.hydro_last_result, c.hydro_next_due_on) === body.hydro_status);
    if (body.cylinder_type_id) rows = rows.filter((c) => c.type_id === body.cylinder_type_id);
    if (search) rows = rows.filter((c) => c.serial_number.toUpperCase().includes(search) || this.identifiers.some((i) => i.cylinder_id === c.id && i.status === 'active' && i.value.toUpperCase() === search));
    rows.sort((a, b) => (desc ? b.serial_number.localeCompare(a.serial_number) : a.serial_number.localeCompare(b.serial_number)));
    const limit = Math.min(Number(body.limit ?? 25), 100);
    const start = body.cursor ? Number(body.cursor) : 0;
    const page = rows.slice(start, start + limit);
    return { status: 200, json: { code: 'LISTED', items: page.map((c) => this.item(c)), total: rows.length, next: start + limit < rows.length ? String(start + limit) : null } };
  }

  private op_get(org: string, body: Json): Reply {
    const c = this.find(org, body.cylinder_id);
    if (!c) return { status: 404, json: { code: 'NOT_FOUND' } };
    const tests = this.tests.filter((t) => t.cylinder_id === c.id).sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at));
    return {
      status: 200,
      json: {
        code: 'FOUND', hydro_status: hydroStatus(c.hydro_last_result, c.hydro_next_due_on),
        cylinder: { ...this.item(c), manufacturer: c.manufacturer, manufacture_year: c.manufacture_year, working_pressure_bar: c.working_pressure_bar, notes: c.notes, inactivation_reason: c.inactivation_reason, hydro_last_result: c.hydro_last_result, hydro_next_due_on: c.hydro_next_due_on, created_at: c.created_at },
        identifiers: this.identifiers.filter((i) => i.cylinder_id === c.id).sort((a, b) => Number(a.status === 'deactivated') - Number(b.status === 'deactivated')),
        tests: tests.map((t) => ({ ...t, superseded: this.tests.some((r) => r.rectifies_test_id === t.id) })),
      },
    };
  }

  private op_lookup(org: string, body: Json): Reply {
    const value = String(body.identifier_value ?? '').trim().toUpperCase();
    const active = this.identifiers.find((i) => i.organization_id === org && i.status === 'active' && i.value.toUpperCase() === value);
    if (active) {
      const c = this.cylinders.find((candidate) => candidate.id === active.cylinder_id)!;
      return { status: 200, json: { code: 'FOUND', cylinder: { id: c.id, serial_number: c.serial_number, status: c.status, stock_status: c.stock_status, hydro_status: hydroStatus(c.hydro_last_result, c.hydro_next_due_on) }, identifier: { id: active.id, kind: active.kind, value: active.value } } };
    }
    return this.notFoundFor(org, value);
  }

  private notFoundFor(org: string, value: string): Reply {
    const old = this.identifiers.find((i) => i.organization_id === org && i.status === 'deactivated' && !i.transferred && i.value.toUpperCase() === value);
    if (old) {
      const c = this.cylinders.find((candidate) => candidate.id === old.cylinder_id)!;
      return { status: 404, json: { code: 'NOT_FOUND', deactivated: true, cylinder: { id: c.id, serial_number: c.serial_number } } };
    }
    return { status: 404, json: { code: 'NOT_FOUND' } };
  }

  private op_history(org: string, body: Json): Reply {
    const c = this.find(org, body.cylinder_id);
    if (!c) return { status: 404, json: { code: 'NOT_FOUND' } };
    const desc = (body.order ?? 'desc') === 'desc';
    let rows = this.events.filter((e) => e.cylinder_id === c.id);
    if (body.event_type) rows = rows.filter((e) => e.event_type === body.event_type);
    if (body.from) rows = rows.filter((e) => e.occurred_at.slice(0, 10) >= String(body.from));
    if (body.to) rows = rows.filter((e) => e.occurred_at.slice(0, 10) <= String(body.to));
    rows.sort((a, b) => (desc ? b.sequence - a.sequence : a.sequence - b.sequence));
    if (body.cursor) rows = rows.filter((e) => (desc ? e.sequence < Number(body.cursor) : e.sequence > Number(body.cursor)));
    const limit = Math.min(Number(body.limit ?? 25), 100);
    const page = rows.slice(0, limit);
    return { status: 200, json: { code: 'LISTED', events: page.map(({ organization_id: _o, cylinder_id: _c, ...event }) => event), next: rows.length > limit ? String(page.at(-1)!.sequence) : null } };
  }

  // ----- comandos -----

  private serialTaken(org: string, serial: string, except?: string): MockCylinder | undefined {
    return this.cylinders.find((c) => c.organization_id === org && c.id !== except && c.serial_number.toUpperCase() === serial.trim().toUpperCase());
  }

  private activeIdentifier(org: string, value: string): MockIdentifier | undefined {
    return this.identifiers.find((i) => i.organization_id === org && i.status === 'active' && i.value.toUpperCase() === value.trim().toUpperCase());
  }

  private op_save_type(org: string, body: Json): Reply {
    const gas = String(body.gas ?? '').trim();
    if (gas.length < 2) return { status: 400, json: { code: 'VALIDATION_FAILED', fields: [{ field: 'gas', message: 'Informe o gás com 2 a 80 caracteres.' }] } };
    const type: MockType = { id: this.id('71'), organization_id: org, gas, capacity_value: Number(body.capacity_value), capacity_unit: String(body.capacity_unit), classification: String(body.classification), active: body.active !== false };
    this.types.push(type);
    return { status: 200, json: { code: 'TYPE_SAVED', type_id: type.id } };
  }

  private op_create(org: string, body: Json): Reply {
    const serial = String(body.serial_number ?? '').trim();
    const identifier = body.identifier as { kind: string; value: string };
    const taken = this.serialTaken(org, serial);
    if (taken) return { status: 409, json: { code: 'SERIAL_CONFLICT', cylinder_id: taken.id } };
    const owner = this.activeIdentifier(org, identifier.value);
    if (owner) return { status: 409, json: { code: 'IDENTIFIER_CONFLICT', cylinder_id: owner.cylinder_id } };
    if (this.identifiers.some((i) => i.organization_id === org && i.value.toUpperCase() === identifier.value.trim().toUpperCase())) return { status: 409, json: { code: 'IDENTIFIER_UNAVAILABLE' } };
    const c: MockCylinder = {
      id: this.id('72'), organization_id: org, type_id: String(body.cylinder_type_id), serial_number: serial, manufacturer: (body.manufacturer as string | null) ?? null,
      manufacture_year: (body.manufacture_year as number | null) ?? null, working_pressure_bar: (body.working_pressure_bar as number | null) ?? null, notes: (body.notes as string | null) ?? null,
      status: 'active', inactivation_reason: null, stock_status: 'out_of_stock', hydro_last_result: null, hydro_next_due_on: null, version: 1, created_at: new Date().toISOString(),
    };
    this.cylinders.push(c);
    this.identifiers.push({ id: this.id('73'), organization_id: org, cylinder_id: c.id, kind: identifier.kind, value: identifier.value.trim(), status: 'active', created_at: c.created_at, deactivated_at: null, deactivation_justification: null, transferred: false });
    this.addEvent(org, c.id, 'cylinder_created', null, { serial_number: serial });
    this.addEvent(org, c.id, 'identifier_added', null, { kind: identifier.kind });
    return { status: 200, json: { code: 'CREATED', cylinder_id: c.id, version: 1 } };
  }

  private op_update(org: string, body: Json): Reply {
    const c = this.find(org, body.cylinder_id);
    if (!c) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (c.status !== 'active') return { status: 409, json: { code: 'CYLINDER_INACTIVE' } };
    if (c.version !== body.expected_version) return { status: 409, json: { code: 'VERSION_CONFLICT' } };
    const serial = String(body.serial_number ?? '').trim();
    const taken = this.serialTaken(org, serial, c.id);
    if (taken) return { status: 409, json: { code: 'SERIAL_CONFLICT', cylinder_id: taken.id } };
    Object.assign(c, { type_id: String(body.cylinder_type_id), serial_number: serial, manufacturer: body.manufacturer ?? null, manufacture_year: body.manufacture_year ?? null, working_pressure_bar: body.working_pressure_bar ?? null, notes: body.notes ?? null });
    c.version += 1;
    this.addEvent(org, c.id, 'cylinder_updated', null, { changes: {} });
    return { status: 200, json: { code: 'UPDATED', version: c.version } };
  }

  private justification(body: Json): boolean { return String(body.justification ?? '').trim().length >= 5; }

  private op_inactivate(org: string, body: Json): Reply {
    const c = this.find(org, body.cylinder_id);
    if (!c) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (c.status === 'inactive') return { status: 409, json: { code: 'ALREADY_INACTIVE' } };
    if (!this.justification(body)) return { status: 400, json: { code: 'JUSTIFICATION_REQUIRED' } };
    const wasInStock = c.stock_status === 'in_stock';
    Object.assign(c, { status: 'inactive', inactivation_reason: String(body.reason), stock_status: 'out_of_stock' });
    c.version += 1;
    this.addEvent(org, c.id, 'cylinder_inactivated', String(body.justification), { reason: body.reason, was_in_stock: wasInStock });
    if (wasInStock) this.addEvent(org, c.id, 'stock_out_inactivation', String(body.justification), { reason: body.reason });
    return { status: 200, json: { code: 'OK', version: c.version } };
  }

  private op_reactivate(org: string, body: Json): Reply {
    const c = this.find(org, body.cylinder_id);
    if (!c) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (!this.justification(body)) return { status: 400, json: { code: 'JUSTIFICATION_REQUIRED' } };
    if (c.status === 'active') return { status: 400, json: { code: 'VALIDATION_FAILED', fields: [{ field: 'cylinder_id', message: 'Este cilindro já está ativo.' }] } };
    Object.assign(c, { status: 'active', inactivation_reason: null, stock_status: 'out_of_stock' });
    c.version += 1;
    this.addEvent(org, c.id, 'cylinder_reactivated', String(body.justification));
    return { status: 200, json: { code: 'OK', version: c.version } };
  }

  private op_add_identifier(org: string, body: Json): Reply {
    const c = this.find(org, body.cylinder_id);
    if (!c) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (c.status !== 'active') return { status: 409, json: { code: 'CYLINDER_INACTIVE' } };
    const value = String(body.value ?? '').trim();
    const owner = this.activeIdentifier(org, value);
    if (owner) return { status: 409, json: { code: 'IDENTIFIER_CONFLICT', cylinder_id: owner.cylinder_id } };
    if (this.identifiers.some((i) => i.organization_id === org && i.value.toUpperCase() === value.toUpperCase())) return { status: 409, json: { code: 'IDENTIFIER_UNAVAILABLE' } };
    const identifier: MockIdentifier = { id: this.id('73'), organization_id: org, cylinder_id: c.id, kind: String(body.kind), value, status: 'active', created_at: new Date().toISOString(), deactivated_at: null, deactivation_justification: null, transferred: false };
    this.identifiers.push(identifier);
    this.addEvent(org, c.id, 'identifier_added', null, { kind: body.kind });
    return { status: 200, json: { code: 'OK', identifier_id: identifier.id } };
  }

  private op_deactivate_identifier(org: string, body: Json): Reply {
    const identifier = this.identifiers.find((i) => i.id === body.identifier_id && i.organization_id === org);
    if (!identifier) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (!this.justification(body)) return { status: 400, json: { code: 'JUSTIFICATION_REQUIRED' } };
    if (identifier.status !== 'active') return { status: 400, json: { code: 'VALIDATION_FAILED', fields: [{ field: 'identifier_id', message: 'Este identificador já está desativado.' }] } };
    Object.assign(identifier, { status: 'deactivated', deactivated_at: new Date().toISOString(), deactivation_justification: String(body.justification) });
    this.addEvent(org, identifier.cylinder_id, 'identifier_deactivated', String(body.justification), { kind: identifier.kind });
    return { status: 200, json: { code: 'OK' } };
  }

  private op_transfer_identifier(org: string, body: Json): Reply {
    const value = String(body.value ?? '').trim();
    const owner = this.activeIdentifier(org, value);
    if (owner) return { status: 409, json: { code: 'IDENTIFIER_CONFLICT', cylinder_id: owner.cylinder_id } };
    const source = this.identifiers.find((i) => i.organization_id === org && i.status === 'deactivated' && !i.transferred && i.value.toUpperCase() === value.toUpperCase());
    if (!source) return { status: 404, json: { code: 'NOT_FOUND' } };
    const target = this.find(org, body.target_cylinder_id);
    if (!target) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (target.status !== 'active') return { status: 409, json: { code: 'CYLINDER_INACTIVE' } };
    const created: MockIdentifier = { id: this.id('73'), organization_id: org, cylinder_id: target.id, kind: source.kind, value: source.value, status: 'active', created_at: new Date().toISOString(), deactivated_at: null, deactivation_justification: null, transferred: false };
    this.identifiers.push(created);
    source.transferred = true;
    this.addEvent(org, source.cylinder_id, 'identifier_transferred_out', String(body.justification), { kind: source.kind });
    this.addEvent(org, target.id, 'identifier_transferred_in', String(body.justification), { kind: source.kind });
    return { status: 200, json: { code: 'OK', identifier_id: created.id } };
  }

  private op_stock_in(org: string, body: Json): Reply {
    const key = `${org}:${String(body.operation_key)}`;
    const value = String(body.identifier_value ?? '').trim().toUpperCase();
    const previous = this.ledger.get(key);
    if (previous) {
      if (previous.value !== value) return { status: 409, json: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' } };
      return { status: 200, json: { ...previous.payload, replayed: true } };
    }
    const identifier = this.activeIdentifier(org, value);
    if (!identifier) return this.notFoundFor(org, value);
    const c = this.cylinders.find((candidate) => candidate.id === identifier.cylinder_id)!;
    if (c.status !== 'active') return { status: 409, json: { code: 'CYLINDER_INACTIVE' } };
    if (c.stock_status === 'in_stock') return { status: 409, json: { code: 'ALREADY_IN_STOCK' } };
    const hydro = hydroStatus(c.hydro_last_result, c.hydro_next_due_on);
    c.stock_status = 'in_stock';
    c.version += 1;
    const sequence = this.addEvent(org, c.id, 'stock_in', null, { identifier_kind: identifier.kind, hydro_status: hydro });
    const payload: Json = {
      code: 'STOCKED', replayed: false, cylinder: { id: c.id, serial_number: c.serial_number, stock_status: 'in_stock' }, event_sequence: sequence, hydro_status: hydro,
      warning: hydro === 'vencido' ? 'hydro_expired' : hydro === 'reprovado' ? 'hydro_rejected' : null,
    };
    this.ledger.set(key, { value, payload });
    if (this.loseNextStockInResponse) { this.loseNextStockInResponse = false; return { status: 504, json: { code: 'INTERNAL_ERROR' } }; }
    return { status: 200, json: payload };
  }

  private validateTest(body: Json): Json[] {
    const errors: Json[] = [];
    if (String(body.performed_on) > today()) errors.push({ field: 'performed_on', message: 'A data de realização não pode ser futura.' });
    if (body.result === 'approved' && !body.next_due_on) errors.push({ field: 'next_due_on', message: 'Informe a próxima data do teste.' });
    return errors;
  }

  private refreshHydro(c: MockCylinder): string {
    const effective = this.tests.filter((t) => t.cylinder_id === c.id && !this.tests.some((r) => r.rectifies_test_id === t.id))
      .sort((a, b) => b.performed_on.localeCompare(a.performed_on) || b.created_at.localeCompare(a.created_at))[0];
    c.hydro_last_result = effective?.result ?? null;
    c.hydro_next_due_on = effective?.result === 'approved' ? effective.next_due_on : null;
    return hydroStatus(c.hydro_last_result, c.hydro_next_due_on);
  }

  private op_register_test(org: string, body: Json): Reply {
    const c = this.find(org, body.cylinder_id);
    if (!c) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (c.status !== 'active') return { status: 409, json: { code: 'CYLINDER_INACTIVE' } };
    const errors = this.validateTest(body);
    if (errors.length > 0) return { status: 400, json: { code: 'VALIDATION_FAILED', fields: errors } };
    const test: MockTest = { id: this.id('74'), organization_id: org, cylinder_id: c.id, performed_on: String(body.performed_on), result: String(body.result), report_number: (body.report_number as string | null) ?? null, executor: String(body.executor), next_due_on: (body.next_due_on as string | null) ?? null, notes: (body.notes as string | null) ?? null, rectifies_test_id: null, rectification_justification: null, created_at: new Date().toISOString() };
    this.tests.push(test);
    const status = this.refreshHydro(c);
    this.addEvent(org, c.id, 'hydrostatic_test_registered', null, { test_id: test.id, result: test.result, performed_on: test.performed_on, next_due_on: test.next_due_on, hydro_status: status });
    return { status: 200, json: { code: 'OK', test_id: test.id, hydro_status: status } };
  }

  private op_rectify_test(org: string, body: Json): Reply {
    const original = this.tests.find((t) => t.id === body.test_id && t.organization_id === org);
    if (!original) return { status: 404, json: { code: 'NOT_FOUND' } };
    if (!this.justification(body)) return { status: 400, json: { code: 'JUSTIFICATION_REQUIRED' } };
    if (this.tests.some((t) => t.rectifies_test_id === original.id)) return { status: 400, json: { code: 'VALIDATION_FAILED', fields: [{ field: 'test_id', message: 'Este registro já foi retificado.' }] } };
    const errors = this.validateTest(body);
    if (errors.length > 0) return { status: 400, json: { code: 'VALIDATION_FAILED', fields: errors } };
    const c = this.cylinders.find((candidate) => candidate.id === original.cylinder_id)!;
    const test: MockTest = { ...original, id: this.id('74'), performed_on: String(body.performed_on), result: String(body.result), report_number: (body.report_number as string | null) ?? null, executor: String(body.executor), next_due_on: (body.next_due_on as string | null) ?? null, notes: (body.notes as string | null) ?? null, rectifies_test_id: original.id, rectification_justification: String(body.justification), created_at: new Date().toISOString() };
    this.tests.push(test);
    const status = this.refreshHydro(c);
    this.addEvent(org, c.id, 'hydrostatic_test_rectified', String(body.justification), { test_id: test.id, rectifies_test_id: original.id, result: test.result, hydro_status: status });
    return { status: 200, json: { code: 'OK', test_id: test.id, hydro_status: status } };
  }
}
