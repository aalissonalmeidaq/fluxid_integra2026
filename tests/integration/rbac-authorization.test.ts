// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageAccessHandler, type AccessGateway } from '../../supabase/functions/manage-access/handler';
import {
  authorize,
  validateRolePermissions,
  type MembershipContext,
  type OrganizationContext,
  type PermissionDefinition,
  type RoleDefinition,
} from '../../src/domain/identity/authorization';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';
const ADMIN_A = '10000000-0000-0000-0000-000000000002';
const ADMIN_B = '10000000-0000-0000-0000-000000000003';
const MEMBER_A = '30000000-0000-0000-0000-00000000000a';
const MEMBER_B = '30000000-0000-0000-0000-00000000000b';
const CUSTOM_A = '50000000-0000-0000-0000-0000000000a1';
const JUSTIFICATION = 'Alteração aprovada pela gestão';

const perm = (code: string, over: Partial<PermissionDefinition> = {}): PermissionDefinition => ({ code, scope: 'tenant', delegability: 'tenant_delegable', critical: false, active: true, ...over });
const MANAGE = perm('tenant.manage', { critical: true });
const AUDIT = perm('audit.read');
const PLATFORM = perm('platform.manage', { scope: 'global', delegability: 'non_delegable', critical: true });

// Repositório em memória que, como o servidor, decide a autorização a cada chamada a partir do estado atual.
function createTrustedStore() {
  const organizations = new Map<string, OrganizationContext>([[A, { id: A, kind: 'tenant', status: 'active' }], [B, { id: B, kind: 'tenant', status: 'active' }]]);
  const roles = new Map<string, RoleDefinition>([[CUSTOM_A, { id: CUSTOM_A, organizationId: A, code: 'gestor', scope: 'tenant', system: false, active: true, permissions: [MANAGE, AUDIT] }]]);
  const memberships = new Map<string, { id: string; userId: string; organizationId: string; status: MembershipContext['status']; roleIds: string[] }>([
    [MEMBER_A, { id: MEMBER_A, userId: ADMIN_A, organizationId: A, status: 'active', roleIds: [CUSTOM_A] }],
    [MEMBER_B, { id: MEMBER_B, userId: ADMIN_B, organizationId: B, status: 'active', roleIds: [] }],
  ]);
  const sessions = new Map<string, { userId: string; aal: 'aal1' | 'aal2'; active: boolean }>([
    ['token-a', { userId: ADMIN_A, aal: 'aal2', active: true }],
    ['token-a-aal1', { userId: ADMIN_A, aal: 'aal1', active: true }],
    ['token-b', { userId: ADMIN_B, aal: 'aal2', active: true }],
  ]);
  const audit: Array<Record<string, unknown>> = [];

  const decide = (userId: string, aal: 'aal1' | 'aal2', organizationId: string) => {
    const membership = [...memberships.values()].find((item) => item.userId === userId && item.organizationId === organizationId) ?? null;
    return authorize({
      session: { active: true, aal }, requestedOrganizationId: organizationId, permission: 'tenant.manage',
      organization: organizations.get(organizationId) ?? null,
      membership: membership && { id: membership.id, organizationId: membership.organizationId, status: membership.status, roles: membership.roleIds.map((id) => roles.get(id)!).filter(Boolean) },
    });
  };

  const gateway: AccessGateway = {
    authenticate: vi.fn(async (token: string) => {
      const session = sessions.get(token);
      return session?.active ? { userId: session.userId, sessionId: `s-${token}`, aal: session.aal } : null;
    }),
    list: vi.fn(async (input: Parameters<AccessGateway['list']>[0]) => decide(input.actorId, sessions.get(`token-${input.actorId === ADMIN_A ? 'a' : 'b'}`)!.aal, input.organizationId).allowed
      ? { kind: 'listed' as const, roles: [...roles.values()].filter((role) => role.organizationId === input.organizationId).map((role) => ({ id: role.id, code: role.code, name: role.code, description: '', system: role.system, active: role.active, version: 1, permissions: role.permissions.map((p) => p.code) })), permissions: [], assignments: [] }
      : { kind: 'access_denied' as const }),
    saveRole: vi.fn(async (input: Parameters<AccessGateway['saveRole']>[0]) => {
      if (!decide(input.actorId, 'aal2', input.organizationId).allowed) return { kind: 'access_denied' as const };
      const requested = input.permissions.map((code) => [MANAGE, AUDIT, PLATFORM].find((candidate) => candidate.code === code)).filter((p): p is PermissionDefinition => Boolean(p));
      if (!validateRolePermissions({ organizationId: input.organizationId, scope: 'tenant', system: false }, requested).valid) return { kind: 'not_delegable' as const };
      return { kind: 'saved' as const, role: { id: 'new-role', version: 1 } };
    }),
    setRoleActive: vi.fn(async () => ({ kind: 'access_denied' as const })),
    changeAssignment: vi.fn(async (input: Parameters<AccessGateway['changeAssignment']>[0]) => {
      if (!decide(input.actorId, 'aal2', input.organizationId).allowed) return { kind: 'access_denied' as const };
      const membership = memberships.get(input.membershipId);
      if (!membership || membership.organizationId !== input.organizationId) return { kind: 'unavailable' as const };
      return { kind: input.assign ? 'assigned' as const : 'removed' as const };
    }),
    audit: vi.fn(async (event: Parameters<AccessGateway['audit']>[0]) => { audit.push(event); }),
  };
  return { organizations, roles, memberships, sessions, audit, gateway };
}

const send = async (store: ReturnType<typeof createTrustedStore>, token: string, body: Record<string, unknown>) => {
  const response = await createManageAccessHandler(store.gateway)(new Request('http://local/manage-access', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};
const list = (org: string) => ({ operation: 'list', organization_id: org });
const assign = (org: string, membership: string) => ({ operation: 'assign_role', organization_id: org, membership_id: membership, role_id: CUSTOM_A, justification: JUSTIFICATION });

describe('autorização RBAC: efeito imediato sem renovar o JWT', () => {
  it('a remoção de permissão bloqueia a próxima chamada com o mesmo token', async () => {
    const store = createTrustedStore();
    expect((await send(store, 'token-a', list(A))).status).toBe(200);
    store.roles.set(CUSTOM_A, { ...store.roles.get(CUSTOM_A)!, permissions: [AUDIT] });
    expect(await send(store, 'token-a', list(A))).toEqual({ status: 403, body: { code: 'ACCESS_DENIED' } });
  });

  it('inativar o papel bloqueia imediatamente', async () => {
    const store = createTrustedStore();
    store.roles.set(CUSTOM_A, { ...store.roles.get(CUSTOM_A)!, active: false });
    expect((await send(store, 'token-a', list(A))).status).toBe(403);
  });

  it('remover o papel do vínculo bloqueia imediatamente', async () => {
    const store = createTrustedStore();
    store.memberships.get(MEMBER_A)!.roleIds = [];
    expect((await send(store, 'token-a', assign(A, MEMBER_A))).status).toBe(403);
  });

  it.each(['blocked', 'inactive'] as const)('vínculo %s bloqueia imediatamente', async (status) => {
    const store = createTrustedStore();
    store.memberships.get(MEMBER_A)!.status = status;
    expect((await send(store, 'token-a', list(A))).status).toBe(403);
  });

  it.each(['suspended', 'inactive'] as const)('tenant %s bloqueia imediatamente', async (status) => {
    const store = createTrustedStore();
    store.organizations.set(A, { id: A, kind: 'tenant', status });
    expect((await send(store, 'token-a', list(A))).status).toBe(403);
  });

  it('a concessão posterior vale na chamada seguinte, sem novo login', async () => {
    const store = createTrustedStore();
    store.roles.set(CUSTOM_A, { ...store.roles.get(CUSTOM_A)!, permissions: [AUDIT] });
    expect((await send(store, 'token-a', list(A))).status).toBe(403);
    store.roles.set(CUSTOM_A, { ...store.roles.get(CUSTOM_A)!, permissions: [MANAGE, AUDIT] });
    expect((await send(store, 'token-a', list(A))).status).toBe(200);
  });

  it('sessão encerrada deixa de autenticar mesmo com o mesmo token', async () => {
    const store = createTrustedStore();
    store.sessions.get('token-a')!.active = false;
    expect((await send(store, 'token-a', list(A))).status).toBe(401);
  });
});

describe('autorização RBAC: isolamento entre Tenant A e Tenant B', () => {
  it('administrador A não lista nem altera o Tenant B, e o administrador B, sem permissão, também não acessa A', async () => {
    const store = createTrustedStore();
    expect((await send(store, 'token-a', list(B))).status).toBe(403);
    expect((await send(store, 'token-a', assign(B, MEMBER_B))).status).toBe(403);
    expect((await send(store, 'token-b', list(A))).status).toBe(403);
    expect((await send(store, 'token-b', list(B))).status).toBe(403);
  });

  it('a listagem do próprio tenant não inclui papéis de outro tenant', async () => {
    const store = createTrustedStore();
    store.roles.set('50000000-0000-0000-0000-0000000000b1', { id: '50000000-0000-0000-0000-0000000000b1', organizationId: B, code: 'segredo_b', scope: 'tenant', system: false, active: true, permissions: [AUDIT] });
    const result = await send(store, 'token-a', list(A));
    expect(JSON.stringify(result.body)).not.toContain('segredo_b');
  });

  it('atribuir a vínculo de outro tenant é indisponível e não vaza a existência do vínculo', async () => {
    const store = createTrustedStore();
    const result = await send(store, 'token-a', assign(A, MEMBER_B));
    expect(result).toEqual({ status: 409, body: { code: 'ROLE_UNAVAILABLE' } });
  });

  it('as negações entre tenants são auditadas sem o tenant solicitado nem o alvo', async () => {
    const store = createTrustedStore();
    await send(store, 'token-a', list(B));
    await send(store, 'token-a', assign(B, MEMBER_B));
    expect(store.audit).toHaveLength(2);
    expect(JSON.stringify(store.audit)).not.toContain(B);
    expect(JSON.stringify(store.audit)).not.toContain(MEMBER_B);
    expect(store.audit.every((event) => event.result === 'denied' && event.reason === 'permission_denied')).toBe(true);
  });
});

describe('autorização RBAC: delegabilidade e MFA nas fronteiras', () => {
  it('permissão global crítica não é delegada nem por requisição direta', async () => {
    const store = createTrustedStore();
    const result = await send(store, 'token-a', { operation: 'save_role', organization_id: A, name: 'Escalada', permissions: ['platform.manage'], justification: JUSTIFICATION });
    expect(result).toEqual({ status: 403, body: { code: 'PERMISSION_NOT_DELEGABLE' } });
    expect(store.audit).toContainEqual(expect.objectContaining({ action: 'role.save', result: 'denied', reason: 'permission_not_delegable' }));
  });

  it('a sessão AAL1 não altera papéis mesmo com permissão vigente', async () => {
    const store = createTrustedStore();
    const result = await send(store, 'token-a-aal1', { operation: 'save_role', organization_id: A, name: 'Auditor', permissions: ['audit.read'], justification: JUSTIFICATION });
    expect(result).toEqual({ status: 403, body: { code: 'MFA_REQUIRED' } });
    expect(store.gateway.saveRole).not.toHaveBeenCalled();
  });

  it('o mesmo pedido válido em AAL2 é aceito', async () => {
    const store = createTrustedStore();
    const result = await send(store, 'token-a', { operation: 'save_role', organization_id: A, name: 'Auditor', permissions: ['audit.read'], justification: JUSTIFICATION });
    expect(result.status).toBe(201);
  });
});
