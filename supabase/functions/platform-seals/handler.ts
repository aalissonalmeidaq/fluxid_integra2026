import { json, preflight } from '../_shared/http.ts';
import { buildArgs, type OperationSpec, type Rule } from '../_shared/operations.ts';

// Borda das operações do Master sobre os lacres da plataforma (Spec 013, contracts/operacoes-plataforma.md; research.md, item 7). No
// molde de manage-organizations: identidade global e platform.manage, com as negações auditadas (sem segundo fator, Spec 013, RF-021). Não há tenant
// de contexto: só a aprovação recebe `organization_id`, que é o tenant de destino. O ator e a sessão vêm do token, nunca do corpo. A
// decisão, a idempotência e a auditoria de sucesso acontecem no banco, na mesma transação.

export interface PlatformIdentity { userId: string; sessionId: string; aal: 'aal1' | 'aal2'; sessionActive: boolean; canManagePlatform: boolean }
export interface PlatformAuditEvent { actorId: string; action: string; result: 'denied' | 'failed'; reason: string }
export interface PlatformSealsGateway {
  authenticate(token: string): Promise<PlatformIdentity | null>;
  rpc(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  audit(event: PlatformAuditEvent): Promise<void>;
}

const uuid: Rule = { t: 'uuid' };
const justification: Rule = { t: 'text', max: 500 };
// `updated_at` como o banco o devolve (texto do timestamptz) ou em ISO 8601.
const instant: Rule = { t: 'text', max: 40, pattern: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/ };
const command: Record<string, [Rule, string]> = { request_id: [uuid, 'p_request'], enrollment_id: [uuid, 'p_enrollment'] };

export const PLATFORM_SEAL_OPERATIONS: Record<string, OperationSpec> = {
  list_enrollments: { rpc: 'list_enrollments', fields: {
    status: [{ t: 'enum', values: ['pending', 'approved', 'refused', 'expired', 'returned'], nullable: true, optional: true }, 'p_status'],
    conflict: [{ t: 'bool', optional: true }, 'p_conflict'],
    offset: [{ t: 'int', min: 0, max: 100000 }, 'p_offset'],
    limit: [{ t: 'int', min: 1, max: 100 }, 'p_limit'],
  } },
  list_tenants_for_seals: { rpc: 'list_tenants_for_seals', fields: {} },
  approve_enrollment: { rpc: 'approve_enrollment', fields: {
    ...command, organization_id: [uuid, 'p_organization'], justification: [justification, 'p_justification'], expected_updated_at: [instant, 'p_expected_updated_at'],
  } },
  refuse_enrollment: { rpc: 'refuse_enrollment', fields: {
    ...command, justification: [justification, 'p_justification'], expected_updated_at: [instant, 'p_expected_updated_at'],
  } },
  reopen_enrollment: { rpc: 'reopen_enrollment', fields: {
    ...command, justification: [justification, 'p_justification'], expected_updated_at: [instant, 'p_expected_updated_at'],
  } },
  replace_enrollment_key: { rpc: 'replace_enrollment_key', fields: {
    ...command, keep_current: [{ t: 'bool', optional: true }, 'p_keep_current'], justification: [justification, 'p_justification'],
    expected_updated_at: [instant, 'p_expected_updated_at'],
  } },
  withdraw_device: { rpc: 'withdraw_device', fields: {
    ...command, forget_networks: [{ t: 'enum', values: ['extras', 'all'], optional: true }, 'p_forget_networks'],
    justification: [justification, 'p_justification'], expected_updated_at: [instant, 'p_expected_updated_at'],
  } },
  request_forget_networks: { rpc: 'request_forget_networks', fields: {
    ...command, justification: [justification, 'p_justification'], expected_updated_at: [instant, 'p_expected_updated_at'],
  } },
  reveal_portal_password: { rpc: 'reveal_portal_password', fields: { request_id: [uuid, 'p_request'], justification: [justification, 'p_justification'] } },
};

const SUCCESS = new Set(['LISTED', 'APPROVED', 'REFUSED', 'REOPENED', 'KEY_REPLACED', 'CONFLICT_CLEARED', 'WITHDRAWN', 'FORGET_REQUESTED', 'REVEALED']);
const STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401, ACCESS_DENIED: 403, MFA_REQUIRED: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400, JUSTIFICATION_REQUIRED: 400,
  STALE: 409, INVALID_STATE: 409, ENROLLMENT_CONFLICT: 409, TENANT_INACTIVE: 409, NETWORKS_NOT_CLEARED: 409, CYLINDER_IN_TRIP: 409,
  REQUEST_REUSED: 409, NOT_CONFIGURED: 409,
};
const ACCESS = 'seal.enrollment_access';
const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function createPlatformSealsHandler(gateway: PlatformSealsGateway) {
  const deny = (identity: PlatformIdentity, action: string, reason: string) =>
    gateway.audit({ actorId: identity.userId, action, result: 'denied', reason }).catch(() => undefined);
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity || !identity.sessionActive) return json({ code: 'AUTH_REQUIRED' }, 401);
    if (!identity.canManagePlatform) {
      await deny(identity, ACCESS, 'permission_denied');
      return json({ code: 'ACCESS_DENIED' }, 403);
    }

    const body = await request.json().catch(() => null) as unknown;
    if (!isObject(body)) return json({ code: 'VALIDATION_FAILED' }, 400);
    const operation = typeof body.operation === 'string' ? body.operation : '';
    const spec = Object.prototype.hasOwnProperty.call(PLATFORM_SEAL_OPERATIONS, operation) ? PLATFORM_SEAL_OPERATIONS[operation] : undefined;
    if (!spec) {
      await deny(identity, 'seal.unknown_operation', 'operation_not_supported');
      return json({ code: 'VALIDATION_FAILED' }, 400);
    }
    // Só os campos do contrato: nenhum tenant de contexto e nenhum ator vindo do corpo.
    const extra = Object.keys(body).filter((key) => key !== 'operation' && !Object.prototype.hasOwnProperty.call(spec.fields, key));
    if (extra.length > 0) return json({ code: 'VALIDATION_FAILED', fields: extra.map((field) => ({ field, message: 'Campo não aceito.' })) }, 400);
    const built = buildArgs(spec, body);
    if (!built.ok) return json({ code: 'VALIDATION_FAILED', fields: built.fields }, 400);

    let result: Record<string, unknown>;
    try {
      result = await gateway.rpc(spec.rpc, { p_actor: identity.userId, p_session: identity.sessionId, ...built.args });
    } catch {
      await gateway.audit({ actorId: identity.userId, action: ACCESS, result: 'failed', reason: 'internal_error' }).catch(() => undefined);
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
    const code = typeof result.code === 'string' ? result.code : '';
    if (SUCCESS.has(code)) return json(result, 200);
    const status = STATUS[code];
    if (status === undefined) return json({ code: 'INTERNAL_ERROR' }, 500);
    if (code === 'ACCESS_DENIED' || code === 'AUTH_REQUIRED') await deny(identity, ACCESS, 'permission_denied');
    return json(result, status);
  };
}
