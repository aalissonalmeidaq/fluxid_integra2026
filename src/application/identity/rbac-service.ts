export interface AccessTransport {
  call(body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type AccessFailure =
  | 'access_denied' | 'mfa_required' | 'not_delegable' | 'immutable' | 'conflict'
  | 'role_unavailable' | 'last_admin' | 'invalid' | 'unavailable';
export type AccessOutcome<T> = { kind: 'success'; value: T } | { kind: AccessFailure };

export interface RoleView {
  id: string; code: string; name: string; description: string;
  system: boolean; active: boolean; version: number; permissions: string[];
}
export interface PermissionView { code: string; description: string; critical: boolean; delegable: boolean }
export interface AssignmentView { membership_id: string; role_id: string }
export interface RoleReceipt { id: string; version: number; active?: boolean }

const FAILURES: Record<string, AccessFailure> = {
  ACCESS_DENIED: 'access_denied',
  AUTH_REQUIRED: 'access_denied',
  MFA_REQUIRED: 'mfa_required',
  PERMISSION_NOT_DELEGABLE: 'not_delegable',
  ROLE_IMMUTABLE: 'immutable',
  CONFLICT: 'conflict',
  ROLE_UNAVAILABLE: 'role_unavailable',
  LAST_ADMIN_REQUIRED: 'last_admin',
  VALIDATION_FAILED: 'invalid',
};

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const isString = (value: unknown): value is string => typeof value === 'string';
const isRole = (value: unknown): value is RoleView => isObject(value)
  && isString(value.id) && isString(value.code) && isString(value.name) && isString(value.description)
  && typeof value.system === 'boolean' && typeof value.active === 'boolean' && typeof value.version === 'number'
  && Array.isArray(value.permissions) && value.permissions.every(isString);
const isPermission = (value: unknown): value is PermissionView => isObject(value)
  && isString(value.code) && isString(value.description) && typeof value.critical === 'boolean' && typeof value.delegable === 'boolean';
const isAssignment = (value: unknown): value is AssignmentView => isObject(value) && isString(value.membership_id) && isString(value.role_id);
const isReceipt = (value: unknown): value is RoleReceipt => isObject(value) && isString(value.id) && typeof value.version === 'number';

// Casos de uso de RBAC fora do React: só traduz o contrato da fronteira servidor; a decisão de acesso é sempre do servidor.
export class RbacService {
  constructor(private readonly transport: AccessTransport) {}

  private async run<T>(payload: Record<string, unknown>, pick: (body: Record<string, unknown>) => T | undefined): Promise<AccessOutcome<T>> {
    try {
      const response = await this.transport.call(payload);
      const body = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = pick(body);
        if (value !== undefined || pick === noPayload) return { kind: 'success', value: value as T };
        return { kind: 'unavailable' };
      }
      const code = body.code;
      return { kind: (isString(code) ? FAILURES[code] : undefined) ?? 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  list(input: { organizationId: string }) {
    return this.run({ operation: 'list', organization_id: input.organizationId }, (body) => {
      if (!Array.isArray(body.roles) || !Array.isArray(body.permissions) || !Array.isArray(body.assignments)) return undefined;
      return { roles: body.roles.filter(isRole), permissions: body.permissions.filter(isPermission), assignments: body.assignments.filter(isAssignment) };
    });
  }

  saveRole(input: { organizationId: string; roleId?: string; expectedVersion?: number; name: string; description: string; permissions: string[]; justification: string }) {
    return this.run<RoleReceipt>({
      operation: 'save_role', organization_id: input.organizationId,
      ...(input.roleId ? { role_id: input.roleId, expected_version: input.expectedVersion } : {}),
      name: input.name.trim(), description: input.description, permissions: input.permissions, justification: input.justification,
    }, (body) => isReceipt(body.role) ? body.role : undefined);
  }

  setRoleActive(input: { organizationId: string; roleId: string; active: boolean; expectedVersion: number; justification: string }) {
    return this.run<RoleReceipt>({
      operation: 'set_role_active', organization_id: input.organizationId, role_id: input.roleId,
      active: input.active, expected_version: input.expectedVersion, justification: input.justification,
    }, (body) => isReceipt(body.role) ? body.role : undefined);
  }

  assignRole(input: { organizationId: string; membershipId: string; roleId: string; justification: string }) {
    return this.change('assign_role', input);
  }

  removeRole(input: { organizationId: string; membershipId: string; roleId: string; justification: string }) {
    return this.change('remove_role', input);
  }

  private change(operation: 'assign_role' | 'remove_role', input: { organizationId: string; membershipId: string; roleId: string; justification: string }) {
    return this.run<void>({
      operation, organization_id: input.organizationId, membership_id: input.membershipId, role_id: input.roleId, justification: input.justification,
    }, noPayload);
  }
}

// Atribuição e remoção não devolvem dados: o sucesso é o próprio código HTTP 2xx.
function noPayload(): undefined { return undefined; }
