import { json, preflight, UUID_PATTERN } from '../_shared/http.ts';

type Identity = { userId: string; sessionId: string; aal: 'aal1' | 'aal2' };
type Actor = { actorId: string; sessionId: string; organizationId: string };

export interface RoleSummary {
  id: string; code: string; name: string; description: string;
  system: boolean; active: boolean; version: number; permissions: string[];
}
export interface PermissionSummary { code: string; description: string; critical: boolean; delegable: boolean }
export interface AssignmentSummary { membership_id: string; role_id: string }

type ListResult =
  | { kind: 'listed'; roles: RoleSummary[]; permissions: PermissionSummary[]; assignments: AssignmentSummary[] }
  | { kind: 'access_denied' };
type Refusal = 'access_denied' | 'not_delegable' | 'invalid' | 'immutable' | 'conflict' | 'unavailable';
type SaveResult = { kind: 'saved'; role: { id: string; version: number; active?: boolean } } | { kind: Refusal };
type AssignmentResult = { kind: 'assigned' | 'removed' } | { kind: 'access_denied' | 'unavailable' | 'invalid' | 'last_admin' };

export interface AccessGateway {
  authenticate(token: string): Promise<Identity | null>;
  list(input: Actor): Promise<ListResult>;
  saveRole(input: Actor & { roleId?: string; name: string; description: string; permissions: string[]; expectedVersion?: number; justification: string }): Promise<SaveResult>;
  setRoleActive(input: Actor & { roleId: string; active: boolean; expectedVersion: number; justification: string }): Promise<SaveResult>;
  changeAssignment(input: Actor & { membershipId: string; roleId: string; assign: boolean; justification: string }): Promise<AssignmentResult>;
  audit(event: { actorId: string; organizationId?: string; action: string; result: 'success' | 'denied' | 'failed'; reason?: string }): Promise<void>;
}

const PERMISSION_CODE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID_PATTERN.test(value);
const text = (value: unknown, min: number, max: number): string | null =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max ? value.trim() : null;
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1;

const invalid = () => json({ code: 'VALIDATION_FAILED' }, 400);
// Negações por permissão não gravam tenant solicitado nem alvo: podem ser sondagem entre tenants (AUD-005).
const deniedByPermission = (actorId: string, action: string) =>
  ({ actorId, action, result: 'denied' as const, reason: 'permission_denied' });

const REFUSALS: Record<Refusal, { code: string; status: number }> = {
  access_denied: { code: 'ACCESS_DENIED', status: 403 },
  not_delegable: { code: 'PERMISSION_NOT_DELEGABLE', status: 403 },
  immutable: { code: 'ROLE_IMMUTABLE', status: 403 },
  conflict: { code: 'CONFLICT', status: 409 },
  unavailable: { code: 'ROLE_UNAVAILABLE', status: 409 },
  invalid: { code: 'VALIDATION_FAILED', status: 400 },
};
const REFUSAL_REASONS: Partial<Record<Refusal, string>> = { not_delegable: 'permission_not_delegable', immutable: 'role_immutable' };

const MUTATIONS: Record<string, string> = {
  save_role: 'role.save', set_role_active: 'role.set_active', assign_role: 'role.assign', remove_role: 'role.unassign',
};

export function createManageAccessHandler(gateway: AccessGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.operation !== 'string' || !uuid(body.organization_id)) return invalid();
    const operation = body.operation;
    const base: Actor = { actorId: identity.userId, sessionId: identity.sessionId, organizationId: body.organization_id };

    // Refusa entradas inválidas antes de qualquer decisão de acesso ou chamada ao gateway.
    let run: () => Promise<Response>;
    let action = MUTATIONS[operation];

    const refuse = async (kind: Refusal, ownTenant = false): Promise<Response> => {
      const { code, status } = REFUSALS[kind];
      const reason = REFUSAL_REASONS[kind];
      if (kind === 'access_denied') await gateway.audit(deniedByPermission(identity.userId, action ?? 'access.list'));
      else if (reason) await gateway.audit({ actorId: identity.userId, ...(ownTenant ? { organizationId: base.organizationId } : {}), action: action ?? 'access.list', result: 'denied', reason });
      return json({ code }, status);
    };

    if (operation === 'list') {
      action = 'access.list';
      run = async () => {
        const listed = await gateway.list(base);
        if (listed.kind === 'access_denied') return refuse('access_denied');
        return json({ code: 'ACCESS_LISTED', roles: listed.roles, permissions: listed.permissions, assignments: listed.assignments });
      };
    } else if (operation === 'save_role') {
      const name = text(body.name, 2, 80);
      const description = body.description === undefined ? '' : typeof body.description === 'string' && body.description.length <= 300 ? body.description : null;
      const permissions = body.permissions;
      const justification = text(body.justification, 10, 500);
      const updating = body.role_id !== undefined;
      if (!name || description === null || !justification) return invalid();
      if (!Array.isArray(permissions) || permissions.length > 50 || !permissions.every((code) => typeof code === 'string' && PERMISSION_CODE.test(code))) return invalid();
      if (updating && (!uuid(body.role_id) || !version(body.expected_version))) return invalid();
      run = async () => {
        const result = await gateway.saveRole({
          ...base, name, description, permissions: permissions as string[], justification,
          ...(updating ? { roleId: body.role_id as string, expectedVersion: body.expected_version as number } : {}),
        });
        if (result.kind !== 'saved') return refuse(result.kind, true);
        return json({ code: updating ? 'ROLE_UPDATED' : 'ROLE_CREATED', role: result.role }, updating ? 200 : 201);
      };
    } else if (operation === 'set_role_active') {
      const justification = text(body.justification, 10, 500);
      if (!uuid(body.role_id) || typeof body.active !== 'boolean' || !version(body.expected_version) || !justification) return invalid();
      run = async () => {
        const result = await gateway.setRoleActive({ ...base, roleId: body.role_id as string, active: body.active as boolean, expectedVersion: body.expected_version as number, justification });
        if (result.kind !== 'saved') return refuse(result.kind, true);
        return json({ code: 'ROLE_STATE_CHANGED', role: result.role });
      };
    } else if (operation === 'assign_role' || operation === 'remove_role') {
      const justification = text(body.justification, 10, 500);
      if (!uuid(body.membership_id) || !uuid(body.role_id) || !justification) return invalid();
      const assign = operation === 'assign_role';
      run = async () => {
        const result = await gateway.changeAssignment({ ...base, membershipId: body.membership_id as string, roleId: body.role_id as string, assign, justification });
        if (result.kind === 'assigned') return json({ code: 'ROLE_ASSIGNED' });
        if (result.kind === 'removed') return json({ code: 'ROLE_REMOVED' });
        if (result.kind === 'last_admin') return json({ code: 'LAST_ADMIN_REQUIRED' }, 409);
        return refuse(result.kind);
      };
    } else {
      return invalid();
    }

    // Toda alteração é ação crítica: exige AAL2 no momento da operação (RF-034, RS-014).
    if (action && operation !== 'list' && identity.aal !== 'aal2') {
      await gateway.audit({ actorId: identity.userId, action, result: 'denied', reason: 'mfa_required' });
      return json({ code: 'MFA_REQUIRED' }, 403);
    }
    try {
      return await run();
    } catch {
      await gateway.audit({ actorId: identity.userId, action: action ?? 'access.list', result: 'failed', reason: 'internal_error' }).catch(() => undefined);
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}
