import { describe, expect, it } from 'vitest';
import {
  authorize,
  canAssignRole,
  canModifyRole,
  effectivePermissions,
  validateRolePermissions,
  wouldLeaveTenantWithoutAdmin,
  type MembershipContext,
  type OrganizationContext,
  type PermissionDefinition,
  type RoleDefinition,
  type SessionContext,
} from './authorization';

const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const TENANT_B = '20000000-0000-0000-0000-00000000000b';
const OWNER = '20000000-0000-0000-0000-000000000001';

const perm = (code: string, overrides: Partial<PermissionDefinition> = {}): PermissionDefinition => ({
  code, scope: 'tenant', delegability: 'tenant_delegable', critical: false, active: true, ...overrides,
});
const P_MANAGE = perm('tenant.manage', { critical: true });
const P_AUDIT = perm('audit.read');
const P_PROFILE = perm('profile.read');
const P_PLATFORM = perm('platform.manage', { scope: 'global', delegability: 'non_delegable', critical: true });

const role = (code: string, permissions: PermissionDefinition[], overrides: Partial<RoleDefinition> = {}): RoleDefinition => ({
  id: `role-${code}`, organizationId: TENANT_A, code, scope: 'tenant', system: false, active: true, permissions, ...overrides,
});
const TENANT_ADMIN = role('tenant_admin', [P_MANAGE, P_AUDIT], { system: true });
const AUDITOR = role('auditor', [P_AUDIT]);

const tenantA: OrganizationContext = { id: TENANT_A, kind: 'tenant', status: 'active' };
const owner: OrganizationContext = { id: OWNER, kind: 'owner', status: 'active' };
const membership = (roles: RoleDefinition[], overrides: Partial<MembershipContext> = {}): MembershipContext => ({
  id: 'm-1', organizationId: TENANT_A, status: 'active', roles, ...overrides,
});
const session = (overrides: Partial<SessionContext> = {}): SessionContext => ({ active: true, aal: 'aal2', ...overrides });

const decide = (over: Partial<Parameters<typeof authorize>[0]> = {}) => authorize({
  session: session(), requestedOrganizationId: TENANT_A, permission: 'audit.read',
  organization: tenantA, membership: membership([AUDITOR]), ...over,
});

describe('effectivePermissions', () => {
  it('une as permissões de todos os papéis ativos do vínculo no tenant', () => {
    const codes = [...effectivePermissions(membership([AUDITOR, role('profile', [P_PROFILE])]), tenantA).keys()].sort();
    expect(codes).toEqual(['audit.read', 'profile.read']);
  });

  it('não repete permissão presente em mais de um papel', () => {
    expect(effectivePermissions(membership([AUDITOR, TENANT_ADMIN]), tenantA).size).toBe(2);
  });

  it('ignora papel inativo e permissão inativa', () => {
    const inactiveRole = role('old', [P_PROFILE], { active: false });
    const inactivePermission = role('stale', [perm('audit.read', { active: false })]);
    expect(effectivePermissions(membership([inactiveRole, inactivePermission]), tenantA).size).toBe(0);
  });

  it('ignora papel de tenant que pertence a outra organização', () => {
    const foreign = role('foreign', [P_MANAGE], { organizationId: TENANT_B });
    expect(effectivePermissions(membership([foreign]), tenantA).size).toBe(0);
  });

  it('só considera permissão global no vínculo da organização proprietária', () => {
    const master = role('master_fluxid', [P_PLATFORM, P_MANAGE], { organizationId: null, scope: 'global', system: true });
    const inOwner = membership([master], { organizationId: OWNER });
    expect([...effectivePermissions(inOwner, owner).keys()].sort()).toEqual(['platform.manage', 'tenant.manage']);
    const inTenant = membership([master]);
    expect(effectivePermissions(inTenant, tenantA).size).toBe(0);
  });

  it('não concede permissão global a papel de tenant nem por dados inconsistentes', () => {
    const sneaky = role('sneaky', [P_PLATFORM]);
    expect(effectivePermissions(membership([sneaky]), tenantA).has('platform.manage')).toBe(false);
  });
});

describe('authorize', () => {
  it('permite quando sessão, vínculo, organização e permissão são comprovados', () => {
    expect(decide()).toEqual({ allowed: true });
  });

  it('nega por padrão sem vínculo', () => {
    expect(decide({ membership: null })).toEqual({ allowed: false, reason: 'membership_missing' });
  });

  it('nega sem organização carregada', () => {
    expect(decide({ organization: null })).toEqual({ allowed: false, reason: 'organization_unavailable' });
  });

  it('nega sessão inválida antes de qualquer outra verificação', () => {
    expect(decide({ session: session({ active: false }), membership: null })).toEqual({ allowed: false, reason: 'session_invalid' });
  });

  it('trata o tenant recebido do cliente apenas como contexto solicitado', () => {
    expect(decide({ requestedOrganizationId: TENANT_B })).toEqual({ allowed: false, reason: 'organization_mismatch' });
    expect(decide({ organization: { ...tenantA, id: TENANT_B } })).toEqual({ allowed: false, reason: 'organization_mismatch' });
  });

  it.each(['suspended', 'inactive'] as const)('nega quando o tenant está %s', (status) => {
    expect(decide({ organization: { ...tenantA, status } })).toEqual({ allowed: false, reason: 'organization_unavailable' });
  });

  it.each(['invited', 'blocked', 'inactive'] as const)('nega quando o vínculo está %s', (status) => {
    expect(decide({ membership: membership([AUDITOR], { status }) })).toEqual({ allowed: false, reason: 'membership_unavailable' });
  });

  it('nega o que não foi concedido', () => {
    expect(decide({ permission: 'tenant.manage' })).toEqual({ allowed: false, reason: 'permission_missing' });
  });

  it('exige AAL2 para permissão crítica e não para as demais', () => {
    const admin = membership([TENANT_ADMIN]);
    expect(decide({ membership: admin, permission: 'tenant.manage', session: session({ aal: 'aal1' }) })).toEqual({ allowed: false, reason: 'mfa_required' });
    expect(decide({ membership: admin, permission: 'tenant.manage' })).toEqual({ allowed: true });
    expect(decide({ membership: admin, permission: 'audit.read', session: session({ aal: 'aal1' }) })).toEqual({ allowed: true });
  });

  it('reflete a remoção de permissão imediatamente, com a mesma sessão', () => {
    const before = membership([role('temp', [P_AUDIT])]);
    expect(decide({ membership: before })).toEqual({ allowed: true });
    const after = membership([role('temp', [])]);
    expect(decide({ membership: after })).toEqual({ allowed: false, reason: 'permission_missing' });
  });

  it('é determinística para a mesma entrada', () => {
    expect(decide()).toEqual(decide());
  });
});

describe('validateRolePermissions', () => {
  const custom = { organizationId: TENANT_A, scope: 'tenant' as const, system: false };

  it('aceita somente permissões delegáveis de escopo de tenant em papel personalizado', () => {
    expect(validateRolePermissions(custom, [P_AUDIT, P_PROFILE, P_MANAGE])).toEqual({ valid: true });
  });

  it('recusa permissão não delegável', () => {
    expect(validateRolePermissions(custom, [P_AUDIT, P_PLATFORM])).toEqual({ valid: false, reason: 'permission_not_delegable', permission: 'platform.manage' });
  });

  it('recusa permissão delegável de escopo global', () => {
    const odd = perm('odd.global', { scope: 'global' });
    expect(validateRolePermissions(custom, [odd])).toEqual({ valid: false, reason: 'permission_scope_mismatch', permission: 'odd.global' });
  });

  it('recusa permissão inativa', () => {
    expect(validateRolePermissions(custom, [perm('audit.read', { active: false })])).toEqual({ valid: false, reason: 'permission_inactive', permission: 'audit.read' });
  });

  it('recusa papel sem organização e papel global personalizado', () => {
    expect(validateRolePermissions({ organizationId: null, scope: 'tenant', system: false }, [P_AUDIT])).toEqual({ valid: false, reason: 'organization_required' });
    expect(validateRolePermissions({ organizationId: TENANT_A, scope: 'global', system: false }, [P_AUDIT])).toEqual({ valid: false, reason: 'role_scope_invalid' });
  });

  it('recusa qualquer alteração de permissões em papel preestabelecido', () => {
    expect(validateRolePermissions({ ...custom, system: true }, [P_AUDIT])).toEqual({ valid: false, reason: 'role_immutable' });
  });

  it('aceita papel sem permissões', () => {
    expect(validateRolePermissions(custom, [])).toEqual({ valid: true });
  });
});

describe('canModifyRole', () => {
  it('permite alterar e inativar somente papel personalizado', () => {
    expect(canModifyRole(AUDITOR)).toBe(true);
    expect(canModifyRole(TENANT_ADMIN)).toBe(false);
  });
});

describe('canAssignRole', () => {
  it('permite atribuir papel do mesmo tenant a vínculo ativo', () => {
    expect(canAssignRole({ role: AUDITOR, membership: membership([]), organization: tenantA })).toEqual({ allowed: true });
  });

  it('recusa papel inativo', () => {
    expect(canAssignRole({ role: role('x', [], { active: false }), membership: membership([]), organization: tenantA })).toEqual({ allowed: false, reason: 'role_inactive' });
  });

  it('recusa vínculo que não está ativo', () => {
    expect(canAssignRole({ role: AUDITOR, membership: membership([], { status: 'invited' }), organization: tenantA })).toEqual({ allowed: false, reason: 'membership_not_active' });
  });

  it('recusa papel de outro tenant', () => {
    expect(canAssignRole({ role: role('x', [], { organizationId: TENANT_B }), membership: membership([]), organization: tenantA })).toEqual({ allowed: false, reason: 'organization_mismatch' });
  });

  it('recusa vínculo de outra organização', () => {
    expect(canAssignRole({ role: AUDITOR, membership: membership([], { organizationId: TENANT_B }), organization: tenantA })).toEqual({ allowed: false, reason: 'organization_mismatch' });
  });

  it('só atribui papel global a vínculo da organização proprietária', () => {
    const globalRole = role('admin_fluxid', [P_MANAGE], { organizationId: null, scope: 'global', system: true });
    expect(canAssignRole({ role: globalRole, membership: membership([]), organization: tenantA })).toEqual({ allowed: false, reason: 'global_role_outside_owner' });
    expect(canAssignRole({ role: globalRole, membership: membership([], { organizationId: OWNER }), organization: owner })).toEqual({ allowed: true });
  });

  it('nunca atribui papel de tenant a vínculo da organização proprietária', () => {
    expect(canAssignRole({ role: role('x', [], { organizationId: OWNER }), membership: membership([], { organizationId: OWNER }), organization: owner })).toEqual({ allowed: false, reason: 'organization_mismatch' });
  });
});

describe('wouldLeaveTenantWithoutAdmin', () => {
  const admin = (id: string, status: MembershipContext['status'] = 'active') => membership([TENANT_ADMIN], { id, status });
  const plain = (id: string) => membership([AUDITOR], { id });

  it('protege o último administrador ativo contra remoção do papel, bloqueio ou inativação', () => {
    const members = [admin('a'), plain('b')];
    expect(wouldLeaveTenantWithoutAdmin({ organization: tenantA, memberships: members, membershipId: 'a' })).toBe(true);
  });

  it('permite a mudança quando outro administrador ativo permanece', () => {
    expect(wouldLeaveTenantWithoutAdmin({ organization: tenantA, memberships: [admin('a'), admin('c')], membershipId: 'a' })).toBe(false);
  });

  it('não conta administrador bloqueado como reserva', () => {
    expect(wouldLeaveTenantWithoutAdmin({ organization: tenantA, memberships: [admin('a'), admin('c', 'blocked')], membershipId: 'a' })).toBe(true);
  });

  it('não interfere em quem não é administrador', () => {
    expect(wouldLeaveTenantWithoutAdmin({ organization: tenantA, memberships: [admin('a'), plain('b')], membershipId: 'b' })).toBe(false);
  });

  it('não interfere em vínculo desconhecido', () => {
    expect(wouldLeaveTenantWithoutAdmin({ organization: tenantA, memberships: [admin('a')], membershipId: 'zzz' })).toBe(false);
  });

  it('não se aplica a tenant que ainda não está ativo nem à organização proprietária', () => {
    expect(wouldLeaveTenantWithoutAdmin({ organization: { ...tenantA, status: 'inactive' }, memberships: [admin('a')], membershipId: 'a' })).toBe(false);
    expect(wouldLeaveTenantWithoutAdmin({ organization: owner, memberships: [admin('a')], membershipId: 'a' })).toBe(false);
  });

  it('ignora papel Administrador do tenant inativo', () => {
    const retired = membership([role('tenant_admin', [P_MANAGE], { system: true, active: false })], { id: 'a' });
    expect(wouldLeaveTenantWithoutAdmin({ organization: tenantA, memberships: [retired], membershipId: 'a' })).toBe(false);
  });
});
