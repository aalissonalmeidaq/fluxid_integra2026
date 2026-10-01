// Regras de autorização e RBAC fora dos componentes React. Toda decisão parte da negação por padrão:
// o tenant recebido do cliente é apenas contexto solicitado e nunca prova de acesso (RF-022, RF-023).
export type OrganizationKind = 'owner' | 'tenant';
export type OrganizationStatus = 'active' | 'suspended' | 'inactive';
export type MembershipStatus = 'invited' | 'active' | 'blocked' | 'inactive';
export type PermissionScope = 'global' | 'tenant';
export type Delegability = 'non_delegable' | 'tenant_delegable';
export type AssuranceLevel = 'aal1' | 'aal2';

export interface PermissionDefinition {
  code: string;
  scope: PermissionScope;
  delegability: Delegability;
  critical: boolean;
  active: boolean;
}

export interface RoleDefinition {
  id: string;
  organizationId: string | null;
  code: string;
  scope: PermissionScope;
  system: boolean;
  active: boolean;
  permissions: readonly PermissionDefinition[];
}

export interface OrganizationContext {
  id: string;
  kind: OrganizationKind;
  status: OrganizationStatus;
}

export interface MembershipContext {
  id: string;
  organizationId: string;
  status: MembershipStatus;
  roles: readonly RoleDefinition[];
}

export interface SessionContext {
  active: boolean;
  aal: AssuranceLevel;
}

export type DenialReason =
  | 'session_invalid'
  | 'membership_missing'
  | 'organization_mismatch'
  | 'organization_unavailable'
  | 'membership_unavailable'
  | 'permission_missing'
  | 'mfa_required';

export type AuthorizationDecision = { allowed: true } | { allowed: false; reason: DenialReason };

const TENANT_ADMIN_CODE = 'tenant_admin';

// União das permissões válidas do vínculo no tenant; nenhum papel ou permissão atravessa organizações (RN-004).
export function effectivePermissions(
  membership: MembershipContext,
  organization: OrganizationContext,
): ReadonlyMap<string, PermissionDefinition> {
  const granted = new Map<string, PermissionDefinition>();
  for (const role of membership.roles) {
    if (!role.active) continue;
    if (role.scope === 'tenant' && role.organizationId !== membership.organizationId) continue;
    if (role.scope === 'global' && organization.kind !== 'owner') continue;
    for (const permission of role.permissions) {
      if (!permission.active) continue;
      if (permission.scope === 'global' && organization.kind !== 'owner') continue;
      granted.set(permission.code, permission);
    }
  }
  return granted;
}

export function authorize(input: {
  session: SessionContext;
  requestedOrganizationId: string;
  permission: string;
  organization: OrganizationContext | null;
  membership: MembershipContext | null;
}): AuthorizationDecision {
  const { session, requestedOrganizationId, permission, organization, membership } = input;
  const deny = (reason: DenialReason): AuthorizationDecision => ({ allowed: false, reason });

  if (!session.active) return deny('session_invalid');
  if (!membership) return deny('membership_missing');
  if (membership.organizationId !== requestedOrganizationId) return deny('organization_mismatch');
  if (!organization) return deny('organization_unavailable');
  if (organization.id !== requestedOrganizationId) return deny('organization_mismatch');
  if (organization.status !== 'active') return deny('organization_unavailable');
  if (membership.status !== 'active') return deny('membership_unavailable');

  const granted = effectivePermissions(membership, organization).get(permission);
  if (!granted) return deny('permission_missing');
  if (granted.critical && session.aal !== 'aal2') return deny('mfa_required');
  return { allowed: true };
}

export type RoleValidation =
  | { valid: true }
  | { valid: false; reason: 'role_immutable' | 'role_scope_invalid' | 'organization_required' }
  | { valid: false; reason: 'permission_inactive' | 'permission_not_delegable' | 'permission_scope_mismatch'; permission: string };

// Papéis preestabelecidos são imutáveis; o papel personalizado só aceita permissões delegáveis do tenant (RF-019, RF-021, RF-021A).
export function validateRolePermissions(
  role: { organizationId: string | null; scope: PermissionScope; system: boolean },
  permissions: readonly PermissionDefinition[],
): RoleValidation {
  if (role.system) return { valid: false, reason: 'role_immutable' };
  if (role.scope !== 'tenant') return { valid: false, reason: 'role_scope_invalid' };
  if (!role.organizationId) return { valid: false, reason: 'organization_required' };
  for (const permission of permissions) {
    if (!permission.active) return { valid: false, reason: 'permission_inactive', permission: permission.code };
    if (permission.delegability !== 'tenant_delegable') return { valid: false, reason: 'permission_not_delegable', permission: permission.code };
    if (permission.scope !== 'tenant') return { valid: false, reason: 'permission_scope_mismatch', permission: permission.code };
  }
  return { valid: true };
}

export const canModifyRole = (role: Pick<RoleDefinition, 'system'>): boolean => !role.system;

export type AssignmentDecision =
  | { allowed: true }
  | { allowed: false; reason: 'role_inactive' | 'organization_mismatch' | 'global_role_outside_owner' | 'membership_not_active' };

// A atribuição vale somente dentro do mesmo escopo organizacional e para vínculo ativo (RF-020).
export function canAssignRole(input: {
  role: RoleDefinition;
  membership: MembershipContext;
  organization: OrganizationContext;
}): AssignmentDecision {
  const { role, membership, organization } = input;
  const deny = (reason: Exclude<AssignmentDecision, { allowed: true }>['reason']): AssignmentDecision => ({ allowed: false, reason });

  if (!role.active) return deny('role_inactive');
  if (membership.organizationId !== organization.id) return deny('organization_mismatch');
  if (role.scope === 'global') {
    if (organization.kind !== 'owner') return deny('global_role_outside_owner');
  } else if (organization.kind === 'owner' || role.organizationId !== organization.id) {
    return deny('organization_mismatch');
  }
  if (membership.status !== 'active') return deny('membership_not_active');
  return { allowed: true };
}

const isActiveTenantAdmin = (membership: MembershipContext): boolean =>
  membership.status === 'active' &&
  membership.roles.some((role) => role.code === TENANT_ADMIN_CODE && role.system && role.active);

// Verdadeiro quando remover o papel, bloquear ou inativar este vínculo deixaria o tenant ativo sem administrador (RN-008).
export function wouldLeaveTenantWithoutAdmin(input: {
  organization: OrganizationContext;
  memberships: readonly MembershipContext[];
  membershipId: string;
}): boolean {
  const { organization, memberships, membershipId } = input;
  if (organization.kind !== 'tenant' || organization.status !== 'active') return false;
  const target = memberships.find((membership) => membership.id === membershipId);
  if (!target || !isActiveTenantAdmin(target)) return false;
  return !memberships.some((membership) => membership.id !== membershipId && isActiveTenantAdmin(membership));
}
