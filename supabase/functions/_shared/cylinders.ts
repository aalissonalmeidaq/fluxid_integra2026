import { json, preflight, UUID_PATTERN } from './http.ts';

// Borda comum das Edge Functions de cilindros (Spec 006): autentica o token, valida o corpo por tabela de operações, chama a
// RPC com o ator e a sessão do TOKEN (nunca do corpo, RF-043) e traduz o código de negócio do banco em HTTP. A decisão de
// acesso, a auditoria de sucesso e o histórico acontecem no banco, na mesma transação do comando (contracts/operacoes-servidor.md).

export type Identity = { userId: string; sessionId: string };

export interface CylinderAuditEvent {
  actorId: string;
  action: string;
  result: 'denied' | 'failed';
  reason: string;
}

export interface CylinderGateway {
  authenticate(token: string): Promise<Identity | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  audit(event: CylinderAuditEvent): Promise<void>;
}

type Common = { optional?: boolean };
export type Rule =
  | (Common & { t: 'uuid' })
  | (Common & { t: 'text'; max: number; nullable?: boolean; noBreaks?: boolean })
  | (Common & { t: 'int'; min?: number; max?: number; nullable?: boolean })
  | (Common & { t: 'number'; min?: number; nullable?: boolean })
  | (Common & { t: 'date'; nullable?: boolean })
  | (Common & { t: 'bool' })
  | (Common & { t: 'literal-true' })
  | (Common & { t: 'enum'; values: readonly string[] })
  | (Common & { t: 'identifier' });

export interface OperationSpec {
  rpc: string;
  // Nome da ação de auditoria (o mesmo que a RPC grava no sucesso); sem ele, usa `cylinder.<operação>`.
  action?: string;
  // Campo do corpo -> [regra, nome do argumento da RPC]. `identifier` gera dois argumentos (tipo e valor).
  fields: Record<string, [Rule, string]>;
}

export const IDENTIFIER_KINDS = ['qr_code', 'data_matrix', 'nfc_tag', 'hull_number'] as const;
export const HYDRO_STATUSES = ['em_dia', 'a_vencer', 'vencido', 'reprovado', 'sem_teste'] as const;
export const EVENT_TYPES = [
  'cylinder_created', 'cylinder_updated', 'cylinder_inactivated', 'cylinder_reactivated', 'identifier_added', 'identifier_deactivated',
  'identifier_transferred_out', 'identifier_transferred_in', 'stock_in', 'stock_out_inactivation', 'hydrostatic_test_registered',
  'hydrostatic_test_rectified',
] as const;

const SUCCESS = new Set(['LISTED', 'FOUND', 'CREATED', 'UPDATED', 'OK', 'STOCKED', 'TYPE_SAVED']);
const STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401, ACCESS_DENIED: 403, MFA_REQUIRED: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400, JUSTIFICATION_REQUIRED: 400,
  SERIAL_CONFLICT: 409, IDENTIFIER_CONFLICT: 409, IDENTIFIER_UNAVAILABLE: 409, VERSION_CONFLICT: 409, CYLINDER_INACTIVE: 409,
  ALREADY_IN_STOCK: 409, ALREADY_INACTIVE: 409, IDEMPOTENCY_PAYLOAD_CONFLICT: 409,
};

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

type Checked = { ok: true; value: unknown } | { ok: false; message: string };

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
      return text.length <= rule.max ? { ok: true, value: text } : { ok: false, message: `Use até ${rule.max} caracteres.` };
    }
    case 'int':
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= (rule.min ?? Number.MIN_SAFE_INTEGER) && value <= (rule.max ?? Number.MAX_SAFE_INTEGER)
        ? { ok: true, value } : { ok: false, message: 'Número inteiro inválido.' };
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && value >= (rule.min ?? -Infinity) ? { ok: true, value } : { ok: false, message: 'Número inválido.' };
    case 'date':
      return typeof value === 'string' && isCalendarDate(value) ? { ok: true, value } : { ok: false, message: 'Data inválida.' };
    case 'bool':
      return typeof value === 'boolean' ? { ok: true, value } : { ok: false, message: 'Valor inválido.' };
    case 'literal-true':
      return value === true ? { ok: true, value } : { ok: false, message: 'Confirmação obrigatória.' };
    case 'enum':
      return typeof value === 'string' && rule.values.includes(value) ? { ok: true, value } : { ok: false, message: 'Valor não permitido.' };
    default:
      return { ok: false, message: 'Regra desconhecida.' };
  }
}

type Built = { ok: true; args: Record<string, unknown> } | { ok: false; fields: Array<{ field: string; message: string }> };

function buildArgs(spec: OperationSpec, body: Record<string, unknown>): Built {
  const args: Record<string, unknown> = {};
  const fields: Array<{ field: string; message: string }> = [];
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
    if (!result.ok) fields.push({ field, message: result.message });
    else if (result.value !== undefined) args[arg] = result.value;
    else args[arg] = null;
  }
  return fields.length > 0 ? { ok: false, fields } : { ok: true, args };
}

export function createCylinderHandler(gateway: CylinderGateway, operations: Record<string, OperationSpec>) {
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
      await gateway.audit({ actorId: identity.userId, action: 'cylinder.unknown_operation', result: 'denied', reason: 'operation_not_supported' }).catch(() => undefined);
      return json({ code: 'VALIDATION_FAILED' }, 400);
    }

    const organizationId = body.organization_id;
    if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) return json({ code: 'VALIDATION_FAILED' }, 400);
    const built = buildArgs(spec, body);
    if (!built.ok) return json({ code: 'VALIDATION_FAILED', fields: built.fields }, 400);

    const action = spec.action ?? `cylinder.${operation}`;
    let result: Record<string, unknown>;
    try {
      result = await gateway.rpc(spec.rpc, { p_actor: identity.userId, p_session: identity.sessionId, p_organization: organizationId, ...built.args });
    } catch {
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
