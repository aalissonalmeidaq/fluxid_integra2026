// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSessionLoginHandler, type LoginGateway } from '../../supabase/functions/session-login/handler';
import { createSessionLogoutHandler, type LogoutGateway } from '../../supabase/functions/session-logout/handler';
import { createPasswordRecoveryHandler, type PasswordRecoveryGateway } from '../../supabase/functions/password-recovery/handler';
import { createManageOrganizationsHandler, type OrganizationGateway } from '../../supabase/functions/manage-organizations/handler';
import { createInviteUserHandler, type InvitationGateway } from '../../supabase/functions/invite-user/handler';
import { createManageMembershipHandler, type MembershipGateway } from '../../supabase/functions/manage-membership/handler';
import { createManageAccessHandler, type AccessGateway } from '../../supabase/functions/manage-access/handler';
import { createQueryAuditHandler, type AuditGateway } from '../../supabase/functions/query-audit/handler';

// Matriz de auditoria (AUD-001 a AUD-006, AUD-010): cada ação sensível ou negada deixa evidência sanitizada.
const ACTOR = '10000000-0000-0000-0000-000000000002';
const SESSION = '60000000-0000-0000-0000-000000000001';
const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const TENANT_B = '20000000-0000-0000-0000-00000000000b';
const MEMBER = '30000000-0000-0000-0000-000000000099';
const ROLE = '50000000-0000-0000-0000-0000000000f1';

// Valores que jamais podem aparecer em um evento de auditoria.
const SECRET_EMAIL = 'pessoa.sigilosa@example.invalid';
const SECRET_PASSWORD = 'Senha-Secreta-123!';
const SECRET_TOKEN = 'jwt-token-confidencial';
const FREE_TEXT = 'Justificativa-Confidencial-XYZ-123';

type Event = Record<string, unknown>;

const post = (url: string, body: unknown, token: string | null = SECRET_TOKEN) =>
  new Request(`http://local/${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

const events: Event[] = [];
const record = (source: string) => async (event: object) => { events.push({ source, ...event }); };

const aal = (level: 'aal1' | 'aal2') => ({ userId: ACTOR, sessionId: SESSION, aal: level });

async function scenarios() {
  events.length = 0;

  // --- Login, sessão e recuperação -------------------------------------------------------------------------------
  const login = (over: Partial<LoginGateway> = {}): LoginGateway => ({
    isRateLimited: vi.fn(async () => false), registerFailure: vi.fn(async () => undefined), clearFailures: vi.fn(async () => undefined),
    signIn: vi.fn(async () => ({ ok: true as const, userId: ACTOR, sessionId: SESSION, aal: 'aal1' as const, session: { access_token: SECRET_TOKEN, refresh_token: 'r', expires_in: 3600, token_type: 'bearer' } })),
    signOutSession: vi.fn(async () => undefined), eligibility: vi.fn(async () => ({ eligible: true, requiresMfa: false })),
    endSession: vi.fn(async () => true), startSession: vi.fn(async () => ({ status: 'started' as const })), audit: vi.fn(record('session-login')), ...over,
  });
  const credentials = { email: SECRET_EMAIL, password: SECRET_PASSWORD };
  await createSessionLoginHandler(login())(post('session-login', credentials, null));
  await createSessionLoginHandler(login({ signIn: vi.fn(async () => ({ ok: false as const })) }))(post('session-login', credentials, null));
  await createSessionLoginHandler(login({ isRateLimited: vi.fn(async () => true) }))(post('session-login', credentials, null));
  await createSessionLoginHandler(login({ eligibility: vi.fn(async () => ({ eligible: false, requiresMfa: false })) }))(post('session-login', credentials, null));
  await createSessionLoginHandler(login({ startSession: vi.fn(async () => ({ status: 'limit_reached' as const, sessions: [] })) }))(post('session-login', credentials, null));
  await createSessionLoginHandler(login())(post('session-login', { ...credentials, revoke_session_id: '60000000-0000-0000-0000-0000000000aa' }, null));

  const logout: LogoutGateway = { authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION })), endSession: vi.fn(async () => true), audit: vi.fn(record('session-logout')) };
  await createSessionLogoutHandler(logout)(post('session-logout', {}));

  const recovery = (over: Partial<PasswordRecoveryGateway> = {}): PasswordRecoveryGateway => ({
    reserve: vi.fn(async () => true), issue: vi.fn(async () => ({ delivery: 'confirmed' as const })), audit: vi.fn(record('password-recovery')), ...over,
  });
  await createPasswordRecoveryHandler(recovery())(post('password-recovery', { email: SECRET_EMAIL }, null));
  await createPasswordRecoveryHandler(recovery({ issue: vi.fn(async () => ({ delivery: 'failed' as const })) }))(post('password-recovery', { email: SECRET_EMAIL }, null));
  await createPasswordRecoveryHandler(recovery({ reserve: vi.fn(async () => false) }))(post('password-recovery', { email: SECRET_EMAIL }, null));

  // --- Organizações ----------------------------------------------------------------------------------------------
  const organizations = (identity: { aal: 'aal1' | 'aal2'; canManagePlatform: boolean }): OrganizationGateway => ({
    authenticate: vi.fn(async () => ({ userId: ACTOR, aal: identity.aal, sessionActive: true, canManagePlatform: identity.canManagePlatform, canManageMaster: false })),
    list: vi.fn(async () => []), create: vi.fn(async () => ({ id: TENANT_A, status: 'inactive' as const, version: 1 })),
    changeStatus: vi.fn(async () => ({ id: TENANT_A, status: 'suspended' as const, version: 2 })),
    inviteFirstAdmin: vi.fn(async () => ({ invitationId: '30000000-0000-0000-0000-000000000099' })), audit: vi.fn(record('manage-organizations')),
  });
  const createOrg = { operation: 'create', legal_name: 'Empresa Sigilosa Ltda.', display_name: 'Empresa Sigilosa', justification: FREE_TEXT };
  await createManageOrganizationsHandler(organizations({ aal: 'aal2', canManagePlatform: true }))(post('manage-organizations', createOrg));
  await createManageOrganizationsHandler(organizations({ aal: 'aal1', canManagePlatform: true }))(post('manage-organizations', createOrg));
  await createManageOrganizationsHandler(organizations({ aal: 'aal2', canManagePlatform: false }))(post('manage-organizations', createOrg));
  await createManageOrganizationsHandler(organizations({ aal: 'aal2', canManagePlatform: true }))(post('manage-organizations', { operation: 'change_status', organization_id: TENANT_A, status: 'suspended', expected_version: 1, justification: FREE_TEXT }));
  await createManageOrganizationsHandler(organizations({ aal: 'aal2', canManagePlatform: true }))(post('manage-organizations', { operation: 'invite_first_admin', organization_id: TENANT_A, email: SECRET_EMAIL, justification: FREE_TEXT }));

  // --- Convites -------------------------------------------------------------------------------------------------
  const invitations = (over: Partial<InvitationGateway> = {}): InvitationGateway => ({
    authenticate: vi.fn(async () => aal('aal2')), authorize: vi.fn(async () => true),
    reserve: vi.fn(async () => ({ kind: 'reserved' as const, id: '70000000-0000-0000-0000-000000000001', expiresAt: '2026-10-03T00:00:00Z' })),
    deliver: vi.fn(async () => ({ authInviteId: 'auth-1' })), markDelivery: vi.fn(async () => undefined), accept: vi.fn(async () => ({ kind: 'accepted' as const, membershipId: MEMBER })),
    audit: vi.fn(record('invite-user')), ...over,
  });
  const invite = { operation: 'invite', organization_id: TENANT_B, email: SECRET_EMAIL, role_id: ROLE, justification: FREE_TEXT };
  await createInviteUserHandler(invitations({ authorize: vi.fn(async () => false) }))(post('invite-user', invite));
  await createInviteUserHandler(invitations({ deliver: vi.fn(async () => { throw new Error('smtp'); }) }))(post('invite-user', invite));

  // --- Vínculos -------------------------------------------------------------------------------------------------
  const membership = (over: Partial<MembershipGateway> = {}): MembershipGateway => ({
    authenticate: vi.fn(async () => aal('aal2')), list: vi.fn(async () => ({ kind: 'access_denied' as const })),
    changeStatus: vi.fn(async () => ({ kind: 'access_denied' as const })), audit: vi.fn(record('manage-membership')), ...over,
  });
  const change = { organization_id: TENANT_B, membership_id: MEMBER, status: 'blocked', expected_version: 1, justification: FREE_TEXT };
  await createManageMembershipHandler(membership())(post('manage-membership', change));
  await createManageMembershipHandler(membership({ authenticate: vi.fn(async () => aal('aal1')) }))(post('manage-membership', change));
  await createManageMembershipHandler(membership())(post('manage-membership', { operation: 'list', organization_id: TENANT_B }));

  // --- RBAC -----------------------------------------------------------------------------------------------------
  const access = (over: Partial<AccessGateway> = {}): AccessGateway => ({
    authenticate: vi.fn(async () => aal('aal2')), list: vi.fn(async () => ({ kind: 'access_denied' as const })),
    saveRole: vi.fn(async () => ({ kind: 'not_delegable' as const })), setRoleActive: vi.fn(async () => ({ kind: 'immutable' as const })),
    changeAssignment: vi.fn(async () => ({ kind: 'access_denied' as const })), audit: vi.fn(record('manage-access')), ...over,
  });
  const save = { operation: 'save_role', organization_id: TENANT_A, name: 'Escalada', permissions: ['platform.manage'], justification: FREE_TEXT };
  await createManageAccessHandler(access())(post('manage-access', save));
  await createManageAccessHandler(access())(post('manage-access', { operation: 'set_role_active', organization_id: TENANT_A, role_id: ROLE, active: false, expected_version: 1, justification: FREE_TEXT }));
  await createManageAccessHandler(access())(post('manage-access', { operation: 'assign_role', organization_id: TENANT_B, membership_id: MEMBER, role_id: ROLE, justification: FREE_TEXT }));
  await createManageAccessHandler(access({ authenticate: vi.fn(async () => aal('aal1')) }))(post('manage-access', save));
  await createManageAccessHandler(access())(post('manage-access', { operation: 'list', organization_id: TENANT_B }));

  // --- Consulta de auditoria ------------------------------------------------------------------------------------
  const audit = (over: Partial<AuditGateway> = {}): AuditGateway => ({
    authenticate: vi.fn(async () => aal('aal2')), query: vi.fn(async () => ({ kind: 'access_denied' as const })), audit: vi.fn(record('query-audit')), ...over,
  });
  await createQueryAuditHandler(audit())(post('query-audit', { scope: 'tenant', organization_id: TENANT_B }));
  await createQueryAuditHandler(audit({ authenticate: vi.fn(async () => aal('aal1')) }))(post('query-audit', { scope: 'global' }));

  return [...events];
}

const find = (all: Event[], source: string, action: string, result: string, reason?: string) =>
  all.find((event) => event.source === source && event.action === action && event.result === result && (reason === undefined || event.reason === reason));

describe('auditoria: cada ação sensível deixa evidência', () => {
  it('login, falhas, limite, revogação, logout e recuperação geram eventos', async () => {
    const all = await scenarios();
    expect(find(all, 'session-login', 'auth.login', 'success')).toBeDefined();
    expect(find(all, 'session-login', 'auth.login.failed', 'failed', 'invalid_credentials')).toBeDefined();
    expect(find(all, 'session-login', 'auth.login.rate_limited', 'denied', 'rate_limited')).toBeDefined();
    expect(find(all, 'session-login', 'auth.login', 'denied', 'account_unavailable')).toBeDefined();
    expect(find(all, 'session-login', 'auth.session.limit_reached', 'denied', 'session_limit')).toBeDefined();
    expect(find(all, 'session-login', 'auth.session.revoke', 'success')).toBeDefined();
    expect(find(all, 'session-logout', 'auth.logout', 'success')).toBeDefined();
    expect(find(all, 'password-recovery', 'auth.recovery.request', 'confirmed')).toBeDefined();
    expect(find(all, 'password-recovery', 'auth.recovery.request', 'failed')).toBeDefined();
    expect(find(all, 'password-recovery', 'auth.recovery.request', 'rate_limited')).toBeDefined();
  });

  it('tenant, convite, vínculo e RBAC registram sucesso e negações críticas', async () => {
    const all = await scenarios();
    expect(find(all, 'manage-organizations', 'organization.create', 'success')).toBeDefined();
    expect(find(all, 'manage-organizations', 'organization.status.change', 'success')).toBeDefined();
    expect(find(all, 'manage-organizations', 'organization.first_admin.invite', 'success')).toBeDefined();
    expect(find(all, 'manage-organizations', 'organization.access', 'denied', 'mfa_required')).toBeDefined();
    expect(find(all, 'manage-organizations', 'organization.access', 'denied', 'permission_denied')).toBeDefined();
    expect(find(all, 'invite-user', 'invitation.send', 'denied', 'permission_denied')).toBeDefined();
    expect(find(all, 'invite-user', 'invitation.send', 'failed', 'delivery_failed')).toBeDefined();
    expect(find(all, 'manage-membership', 'membership.status.change', 'denied', 'permission_denied')).toBeDefined();
    expect(find(all, 'manage-membership', 'membership.status.change', 'denied', 'mfa_required')).toBeDefined();
    expect(find(all, 'manage-membership', 'membership.list', 'denied', 'permission_denied')).toBeDefined();
    expect(find(all, 'manage-access', 'role.save', 'denied', 'permission_not_delegable')).toBeDefined();
    expect(find(all, 'manage-access', 'role.set_active', 'denied', 'role_immutable')).toBeDefined();
    expect(find(all, 'manage-access', 'role.assign', 'denied', 'permission_denied')).toBeDefined();
    expect(find(all, 'manage-access', 'role.save', 'denied', 'mfa_required')).toBeDefined();
    expect(find(all, 'manage-access', 'access.list', 'denied', 'permission_denied')).toBeDefined();
    expect(find(all, 'query-audit', 'audit.query', 'denied', 'permission_denied')).toBeDefined();
    expect(find(all, 'query-audit', 'audit.query', 'denied', 'mfa_required')).toBeDefined();
  });

  it('todo evento identifica o ator quando conhecido, a ação e o resultado', async () => {
    const all = await scenarios();
    for (const event of all) {
      expect(typeof event.action).toBe('string');
      // A recuperação registra o estado real da entrega (confirmed, pending, failed, rate_limited) em vez de sucesso ou negação.
      const allowed = event.source === 'password-recovery' ? ['confirmed', 'pending', 'failed', 'not_applicable', 'rate_limited'] : ['success', 'denied', 'failed'];
      expect(allowed).toContain(event.result);
    }
    const withActor = all.filter((event) => !['auth.login.failed', 'auth.login.rate_limited', 'auth.recovery.request'].includes(String(event.action)));
    expect(withActor.every((event) => typeof event.actorId === 'string')).toBe(true);
  });
});

describe('auditoria: sanitização', () => {
  it('nenhum evento carrega senha, token, e-mail, segredo nem credencial', async () => {
    const serialized = JSON.stringify(await scenarios());
    for (const forbidden of [SECRET_PASSWORD, SECRET_TOKEN, SECRET_EMAIL, 'Bearer ']) expect(serialized).not.toContain(forbidden);
    expect(serialized).not.toMatch(/refresh_token|access_token|authorization|service_role|apikey|"password"|"senha"/i);
    expect(serialized).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it('a recuperação usa somente o hash da identidade, nunca o e-mail', async () => {
    const all = await scenarios();
    const recoveries = all.filter((event) => event.source === 'password-recovery');
    expect(recoveries.length).toBeGreaterThan(0);
    for (const event of recoveries) {
      expect(String(event.identityHash)).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(event)).not.toContain('@');
    }
  });

  it('a justificativa livre só acompanha eventos de sucesso, nunca negações', async () => {
    const all = await scenarios();
    for (const event of all.filter((candidate) => candidate.result !== 'success')) expect(event.justification).toBeUndefined();
    expect(all.filter((event) => event.justification === FREE_TEXT).every((event) => event.result === 'success')).toBe(true);
  });

  it('negações por permissão não gravam o tenant solicitado nem o alvo (acesso cruzado)', async () => {
    const all = await scenarios();
    const permissionDenials = all.filter((event) => event.result === 'denied' && event.reason === 'permission_denied');
    expect(permissionDenials.length).toBeGreaterThan(3);
    for (const event of permissionDenials) {
      expect(event.organizationId).toBeUndefined();
      expect(event.targetId).toBeUndefined();
      expect(JSON.stringify(event)).not.toContain(TENANT_B);
      expect(JSON.stringify(event)).not.toContain(MEMBER);
    }
  });

  it('as negações por MFA e por regra do domínio também não expõem dados do alvo', async () => {
    const all = await scenarios();
    const denials = all.filter((event) => event.result === 'denied' && ['mfa_required', 'permission_not_delegable', 'role_immutable'].includes(String(event.reason)));
    expect(denials.length).toBeGreaterThan(3);
    for (const event of denials) {
      expect(event.targetId).toBeUndefined();
      expect(JSON.stringify(event)).not.toContain(MEMBER);
      expect(JSON.stringify(event)).not.toContain(SECRET_EMAIL);
    }
  });
});
