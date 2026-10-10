import { json, preflight, UUID_PATTERN } from './http.ts';

// Borda comum das Edge Functions de domínio (Specs 006 e 007): autentica o token, valida o corpo por tabela de operações, chama a
// RPC com o ator e a sessão do TOKEN (nunca do corpo, RF-043 e RF-053) e traduz o código de negócio do banco em HTTP. A decisão de
// acesso, a auditoria de sucesso e o histórico acontecem no banco, na mesma transação do comando (contracts/operacoes-servidor.md).
// Extraída de `_shared/cylinders.ts` sem mudar o comportamento dos cilindros: `cylinders.ts` continua exportando os mesmos nomes.

export type Identity = { userId: string; sessionId: string; aal?: 'aal1' | 'aal2' };

export interface OperationAuditEvent {
  actorId: string;
  action: string;
  result: 'denied' | 'failed';
  reason: string;
}

export interface OperationsGateway {
  authenticate(token: string): Promise<Identity | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  audit(event: OperationAuditEvent): Promise<void>;
}

type Common = { optional?: boolean };
export type Rule =
  | (Common & { t: 'uuid' })
  | (Common & { t: 'text'; max: number; nullable?: boolean; noBreaks?: boolean; pattern?: RegExp })
  | (Common & { t: 'int'; min?: number; max?: number; nullable?: boolean })
  | (Common & { t: 'number'; min?: number; max?: number; nullable?: boolean })
  | (Common & { t: 'date'; nullable?: boolean })
  | (Common & { t: 'time'; nullable?: boolean })
  | (Common & { t: 'bool' })
  | (Common & { t: 'literal-true' })
  | (Common & { t: 'enum'; values: readonly string[]; nullable?: boolean })
  | (Common & { t: 'int-list'; min: number; max: number; maxItems: number; nullable?: boolean })
  | (Common & { t: 'uuid-list'; maxItems: number; minItems?: number; nullable?: boolean })
  | (Common & { t: 'object'; fields: Record<string, Rule>; nullable?: boolean })
  | (Common & { t: 'objects'; fields: Record<string, Rule>; maxItems: number; minItems?: number; nullable?: boolean })
  | (Common & { t: 'identifier' });

export interface OperationSpec {
  rpc: string;
  // Nome da ação de auditoria (o mesmo que a RPC grava no sucesso); sem ele, usa `<prefixo>.<operação>`.
  action?: string;
  // Exige sessão com segundo fator (`aal2`); sem ela responde MFA_REQUIRED e audita a negação (ex.: anonimização, RF-055).
  mfa?: boolean;
  // Campo do corpo -> [regra, nome do argumento da RPC]. `identifier` gera dois argumentos (tipo e valor).
  fields: Record<string, [Rule, string]>;
}

export const IDENTIFIER_KINDS = ['qr_code', 'data_matrix', 'nfc_tag', 'hull_number'] as const;

const SUCCESS = new Set([
  'LISTED', 'FOUND', 'CREATED', 'UPDATED', 'OK', 'STOCKED', 'TYPE_SAVED',
  'INACTIVATED', 'REACTIVATED', 'LINKED', 'UNLINKED', 'REVEALED', 'ANONYMIZED', 'STATUS_CHANGED',
  // Spec 008 (viagens).
  'LOADING', 'REVERTED', 'CHECKED', 'UNCHECKED', 'REMOVED', 'STARTED', 'ARRIVED', 'DELIVERED', 'UNLOCKED', 'RETURNED', 'COMPLETED', 'CANCELLED',
]);
const STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401, ACCESS_DENIED: 403, MFA_REQUIRED: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400, JUSTIFICATION_REQUIRED: 400,
  SERIAL_CONFLICT: 409, IDENTIFIER_CONFLICT: 409, IDENTIFIER_UNAVAILABLE: 409, VERSION_CONFLICT: 409, CYLINDER_INACTIVE: 409,
  ALREADY_IN_STOCK: 409, ALREADY_INACTIVE: 409, IDEMPOTENCY_PAYLOAD_CONFLICT: 409,
  // Spec 007 (clientes, unidades, geocercas, veículos e motoristas).
  DOCUMENT_CONFLICT: 409, PLATE_CONFLICT: 409, NAME_CONFLICT: 409, INACTIVE_RECORD: 409, PARENT_INACTIVE: 409, CASCADE_CHANGED: 409,
  USER_NOT_ELIGIBLE: 409, GEOMETRY_INVALID: 400, ANONYMIZED_RECORD: 409, ALREADY_ANONYMIZED: 409, ACTIVE_RECORD: 409,
  CONFIRMATION_REQUIRED: 400,
  // Spec 008 (viagens, paradas, carga e entrega).
  CYLINDER_RESERVED: 409, CYLINDER_NOT_ELIGIBLE: 409, CAPACITY_EXCEEDED: 409, RESOURCE_BUSY: 409, DRIVER_LICENSE_EXPIRED: 409, INVALID_TRANSITION: 409,
  ITEMS_PENDING: 409, STOPS_OPEN: 409, TRIP_CLOSED: 409, STOP_CLOSED: 409, REQUEST_REUSED: 409, CYLINDER_IN_TRIP: 409,
};

// Exceções do banco (gatilhos) que a borda traduz em código de negócio, sem reescrever as RPCs que as provocam.
export const DATABASE_EXCEPTIONS: Record<string, string> = { anonymized_record: 'ANONYMIZED_RECORD' };

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

type FieldIssue = { field: string; message: string };
type Checked = { ok: true; value: unknown } | { ok: false; message: string; issues?: FieldIssue[] };

// Valida um objeto aninhado campo a campo; os caminhos dos erros ficam `pai.filho` (relativos ao objeto, sem o nome do campo de fora).
function checkFields(fields: Record<string, Rule>, source: Record<string, unknown>, prefix: string): { value: Record<string, unknown>; issues: FieldIssue[] } {
  const value: Record<string, unknown> = {};
  const issues: FieldIssue[] = [];
  for (const [name, rule] of Object.entries(fields)) {
    const path = prefix === '' ? name : `${prefix}.${name}`;
    const result = check(rule, source[name]);
    if (!result.ok) {
      if (result.issues) issues.push(...result.issues.map((issue) => ({ ...issue, field: `${path}.${issue.field}` })));
      else issues.push({ field: path, message: result.message });
    } else if (result.value !== undefined) value[name] = result.value;
  }
  return { value, issues };
}

function check(rule: Rule, value: unknown): Checked {
  if (value === undefined) return rule.optional ? { ok: true, value: undefined } : { ok: false, message: 'Campo obrigatório.' };
  const nullable = 'nullable' in rule && rule.nullable === true;
  if (value === null) return nullable ? { ok: true, value: null } : { ok: false, message: 'Campo obrigatório.' };
  switch (rule.t) {
    case 'uuid':
      return typeof value === 'string' && UUID_PATTERN.test(value) ? { ok: true, value } : { ok: false, message: 'Identificador inválido.' };
    case 'text': {
      if (typeof value !== 'string') return { ok: false, message: 'Texto inválido.' };
      const text = value.trim();
      if (rule.noBreaks && /[\r\n]/.test(value)) return { ok: false, message: 'Não pode ter quebra de linha.' };
      if (text === '') return nullable ? { ok: true, value: null } : { ok: false, message: 'Campo obrigatório.' };
      if (rule.pattern && !rule.pattern.test(text)) return { ok: false, message: 'Formato inválido.' };
      return text.length <= rule.max ? { ok: true, value: text } : { ok: false, message: `Use até ${rule.max} caracteres.` };
    }
    case 'int':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= (rule.min ?? Number.MIN_SAFE_INTEGER) && value <= (rule.max ?? Number.MAX_SAFE_INTEGER)
        ? { ok: true, value } : { ok: false, message: 'Número inteiro inválido.' };
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= (rule.min ?? -Infinity) && value <= (rule.max ?? Infinity)
        ? { ok: true, value } : { ok: false, message: 'Número inválido.' };
    case 'date':
      return typeof value === 'string' && isCalendarDate(value) ? { ok: true, value } : { ok: false, message: 'Data inválida.' };
    case 'time':
      return typeof value === 'string' && ISO_TIME.test(value) ? { ok: true, value } : { ok: false, message: 'Horário inválido (use HH:MM).' };
    case 'bool':
      return typeof value === 'boolean' ? { ok: true, value } : { ok: false, message: 'Valor inválido.' };
    case 'literal-true':
      return value === true ? { ok: true, value } : { ok: false, message: 'Confirmação obrigatória.' };
    case 'enum':
      return typeof value === 'string' && rule.values.includes(value) ? { ok: true, value } : { ok: false, message: 'Valor não permitido.' };
    case 'int-list': {
      if (!Array.isArray(value) || value.length === 0 || value.length > rule.maxItems) return { ok: false, message: 'Lista inválida.' };
      const allInts = value.every((item) => typeof item === 'number' && Number.isInteger(item) && item >= rule.min && item <= rule.max);
      return allInts && new Set(value).size === value.length ? { ok: true, value } : { ok: false, message: 'Lista inválida.' };
    }
    case 'uuid-list': {
      if (!Array.isArray(value) || value.length > rule.maxItems || value.length < (rule.minItems ?? 0)) return { ok: false, message: 'Lista inválida.' };
      const allUuids = value.every((item) => typeof item === 'string' && UUID_PATTERN.test(item));
      return allUuids ? { ok: true, value } : { ok: false, message: 'Lista inválida.' };
    }
    case 'object': {
      if (!isObject(value)) return { ok: false, message: 'Objeto inválido.' };
      const nested = checkFields(rule.fields, value, '');
      return nested.issues.length > 0 ? { ok: false, message: 'Campos inválidos.', issues: nested.issues } : { ok: true, value: nested.value };
    }
    case 'objects': {
      if (!Array.isArray(value) || value.length > rule.maxItems || value.length < (rule.minItems ?? 0)) return { ok: false, message: 'Lista inválida.' };
      const items: Record<string, unknown>[] = [];
      const issues: FieldIssue[] = [];
      value.forEach((item, index) => {
        if (!isObject(item)) {
          issues.push({ field: String(index), message: 'Objeto inválido.' });
          return;
        }
        const nested = checkFields(rule.fields, item, String(index));
        issues.push(...nested.issues);
        items.push(nested.value);
      });
      return issues.length > 0 ? { ok: false, message: 'Itens inválidos.', issues } : { ok: true, value: items };
    }
    default:
      return { ok: false, message: 'Regra desconhecida.' };
  }
}

type Built = { ok: true; args: Record<string, unknown> } | { ok: false; fields: FieldIssue[] };

function buildArgs(spec: OperationSpec, body: Record<string, unknown>): Built {
  const args: Record<string, unknown> = {};
  const fields: FieldIssue[] = [];
  for (const [field, [rule, arg]] of Object.entries(spec.fields)) {
    if (rule.t === 'identifier') {
      const raw = body[field];
      if (raw === undefined && rule.optional) continue;
      if (!isObject(raw)) { fields.push({ field, message: 'Informe o identificador.' }); continue; }
      const kind = check({ t: 'enum', values: IDENTIFIER_KINDS }, raw.kind);
      const value = check({ t: 'text', max: 200, noBreaks: true }, typeof raw.value === 'string' ? raw.value : undefined);
      if (!kind.ok) fields.push({ field: `${field}.kind`, message: kind.message });
      if (!value.ok) fields.push({ field: `${field}.value`, message: value.message });
      if (kind.ok && value.ok) { args[`${arg}_kind`] = kind.value; args[`${arg}_value`] = value.value; }
      continue;
    }
    const result = check(rule, body[field]);
    if (!result.ok) {
      if (result.issues) fields.push(...result.issues.map((issue) => ({ ...issue, field: `${field}.${issue.field}` })));
      else fields.push({ field, message: result.message });
    } else if (result.value !== undefined) args[arg] = result.value;
    else args[arg] = null;
  }
  return fields.length > 0 ? { ok: false, fields } : { ok: true, args };
}

export interface OperationsHandlerOptions {
  // Prefixo do nome de auditoria e da operação desconhecida (`cylinder`, `registry`).
  prefix?: string;
}

export function createOperationsHandler(gateway: OperationsGateway, operations: Record<string, OperationSpec>, options: OperationsHandlerOptions = {}) {
  const prefix = options.prefix ?? 'cylinder';
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);

    const body = await request.json().catch(() => null) as unknown;
    if (!isObject(body)) return json({ code: 'VALIDATION_FAILED' }, 400);

    const operation = typeof body.operation === 'string' ? body.operation : '';
    const spec = Object.prototype.hasOwnProperty.call(operations, operation) ? operations[operation] : undefined;
    if (!spec) {
      // Exclusão e qualquer operação desconhecida não existem: recusa e registra a tentativa (RF-005, CA-003).
      await gateway.audit({ actorId: identity.userId, action: `${prefix}.unknown_operation`, result: 'denied', reason: 'operation_not_supported' }).catch(() => undefined);
      return json({ code: 'VALIDATION_FAILED' }, 400);
    }

    const action = spec.action ?? `${prefix}.${operation}`;
    if (spec.mfa && identity.aal !== 'aal2') {
      await gateway.audit({ actorId: identity.userId, action, result: 'denied', reason: 'mfa_required' }).catch(() => undefined);
      return json({ code: 'MFA_REQUIRED' }, 403);
    }

    const organizationId = body.organization_id;
    if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) return json({ code: 'VALIDATION_FAILED' }, 400);
    const built = buildArgs(spec, body);
    if (!built.ok) return json({ code: 'VALIDATION_FAILED', fields: built.fields }, 400);

    let result: Record<string, unknown>;
    try {
      result = await gateway.rpc(spec.rpc, { p_actor: identity.userId, p_session: identity.sessionId, p_organization: organizationId, ...built.args });
    } catch (error) {
      const known = error instanceof Error ? DATABASE_EXCEPTIONS[error.message] : undefined;
      if (known) return json({ code: known }, STATUS[known] ?? 409);
      await gateway.audit({ actorId: identity.userId, action, result: 'failed', reason: 'internal_error' }).catch(() => undefined);
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }

    const code = typeof result.code === 'string' ? result.code : '';
    if (SUCCESS.has(code)) return json(result, 200);
    const status = STATUS[code];
    if (status === undefined) return json({ code: 'INTERNAL_ERROR' }, 500);
    if (code === 'ACCESS_DENIED' || code === 'AUTH_REQUIRED') {
      await gateway.audit({ actorId: identity.userId, action, result: 'denied', reason: 'permission_denied' }).catch(() => undefined);
      return json({ code }, status);
    }
    return json(result, status);
  };
}
