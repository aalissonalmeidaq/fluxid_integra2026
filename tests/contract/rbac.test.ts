// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageAccessHandler, type AccessGateway } from '../../supabase/functions/manage-access/handler';

const ACTOR = '10000000-0000-0000-0000-000000000002';
const SESSION = '60000000-0000-0000-0000-000000000001';
const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const TENANT_B = '20000000-0000-0000-0000-00000000000b';
const ROLE = '50000000-0000-0000-0000-0000000000f1';
const MEMBER = '30000000-0000-0000-0000-0000000000f3';
const ADMIN_ROLE = '50000000-0000-0000-0000-000000000003';
const JUSTIFICATION = 'Alteração aprovada pela gestão';

const listed = {
  kind: 'listed' as const,
  roles: [{ id: ROLE, code: 'custom_a', name: 'Auditor', description: '', system: false, active: true, version: 1, permissions: ['audit.read'] }],
  permissions: [{ code: 'audit.read', description: 'Consultar auditoria', critical: false, delegable: true }],
  assignments: [{ membership_id: MEMBER, role_id: ROLE }],
};

function gateway(overrides: Partial<AccessGateway> = {}): AccessGateway {
  return {
    authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION, aal: 'aal2' as const })),
    list: vi.fn(async () => listed),
    saveRole: vi.fn(async () => ({ kind: 'saved' as const, role: { id: ROLE, version: 1 } })),
    setRoleActive: vi.fn(async () => ({ kind: 'saved' as const, role: { id: ROLE, version: 2, active: false } })),
    changeAssignment: vi.fn(async (input) => ({ kind: input.assign ? 'assigned' as const : 'removed' as const })),
    audit: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function call(gw: AccessGateway, body: unknown, token: string | null = 'jwt') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await createManageAccessHandler(gw)(new Request('http://local/manage-access', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const create = { operation: 'save_role', organization_id: TENANT_A, name: 'Auditor', description: 'Consulta auditoria', permissions: ['audit.read'], justification: JUSTIFICATION };

describe('manage-access: autenticação e listagem', () => {
  it('exige sessão autenticada', async () => {
    const gw = gateway();
    expect((await call(gw, { operation: 'list', organization_id: TENANT_A }, null)).status).toBe(401);
    const denied = gateway({ authenticate: vi.fn(async () => null) });
    expect((await call(denied, { operation: 'list', organization_id: TENANT_A })).status).toBe(401);
    expect(denied.list).not.toHaveBeenCalled();
  });

  it('lista papéis, permissões e atribuições sem exigir MFA de leitura', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION, aal: 'aal1' as const })) });
    const result = await call(gw, { operation: 'list', organization_id: TENANT_A });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ code: 'ACCESS_LISTED', roles: listed.roles, permissions: listed.permissions, assignments: listed.assignments });
    expect(gw.list).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, organizationId: TENANT_A });
  });

  it('nega tenant não autorizado, audita sem tenant nem alvo e não revela dados', async () => {
    const gw = gateway({ list: vi.fn(async () => ({ kind: 'access_denied' as const })) });
    const result = await call(gw, { operation: 'list', organization_id: TENANT_B });
    expect(result).toEqual({ status: 403, body: { code: 'ACCESS_DENIED' } });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: ACTOR, action: 'access.list', result: 'denied', reason: 'permission_denied' });
  });

  it.each([{ operation: 'list' }, { operation: 'list', organization_id: 'nao-e-uuid' }, { operation: 'desconhecida', organization_id: TENANT_A }, {}])('rejeita entrada inválida %j antes do gateway', async (body) => {
    const gw = gateway();
    expect(await call(gw, body)).toEqual({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    expect(gw.list).not.toHaveBeenCalled();
  });
});

describe('manage-access: papéis personalizados', () => {
  it('cria papel com permissões delegáveis e devolve o identificador e a versão', async () => {
    const gw = gateway();
    const result = await call(gw, create);
    expect(result).toEqual({ status: 201, body: { code: 'ROLE_CREATED', role: { id: ROLE, version: 1 } } });
    expect(gw.saveRole).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, organizationId: TENANT_A, name: 'Auditor', description: 'Consulta auditoria', permissions: ['audit.read'], justification: JUSTIFICATION });
  });

  it('altera papel com a versão esperada', async () => {
    const gw = gateway({ saveRole: vi.fn(async () => ({ kind: 'saved' as const, role: { id: ROLE, version: 2 } })) });
    const result = await call(gw, { ...create, role_id: ROLE, expected_version: 1 });
    expect(result).toEqual({ status: 200, body: { code: 'ROLE_UPDATED', role: { id: ROLE, version: 2 } } });
    expect(gw.saveRole).toHaveBeenCalledWith(expect.objectContaining({ roleId: ROLE, expectedVersion: 1 }));
  });

  it('exige a versão esperada ao alterar', async () => {
    const gw = gateway();
    expect(await call(gw, { ...create, role_id: ROLE })).toEqual({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    expect(gw.saveRole).not.toHaveBeenCalled();
  });

  it('nega permissão não delegável, audita a negação no tenant e não persiste', async () => {
    const gw = gateway({ saveRole: vi.fn(async () => ({ kind: 'not_delegable' as const })) });
    const result = await call(gw, { ...create, permissions: ['platform.manage'] });
    expect(result).toEqual({ status: 403, body: { code: 'PERMISSION_NOT_DELEGABLE' } });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: ACTOR, organizationId: TENANT_A, action: 'role.save', result: 'denied', reason: 'permission_not_delegable' });
  });

  it.each(['technical_operator', 'stock_operator', 'driver', 'tenant_admin'])('papel preestabelecido %s é imutável e a negação é auditada', async () => {
    const gw = gateway({ saveRole: vi.fn(async () => ({ kind: 'immutable' as const })) });
    const result = await call(gw, { ...create, role_id: ADMIN_ROLE, expected_version: 1 });
    expect(result).toEqual({ status: 403, body: { code: 'ROLE_IMMUTABLE' } });
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ result: 'denied', reason: 'role_immutable' }));
  });

  it.each([
    ['conflict', 'CONFLICT', 409],
    ['unavailable', 'ROLE_UNAVAILABLE', 409],
    ['invalid', 'VALIDATION_FAILED', 400],
    ['access_denied', 'ACCESS_DENIED', 403],
  ] as const)('traduz %s do gateway para %s', async (kind, code, status) => {
    const gw = gateway({ saveRole: vi.fn(async () => ({ kind })) });
    expect(await call(gw, { ...create, role_id: ROLE, expected_version: 1 })).toEqual({ status, body: { code } });
  });

  it('atualizações concorrentes com a mesma versão: uma vence e a outra recebe CONFLICT', async () => {
    let version = 1;
    const gw = gateway({
      saveRole: vi.fn(async (input) => {
        if (input.expectedVersion !== version) return { kind: 'conflict' as const };
        version += 1;
        return { kind: 'saved' as const, role: { id: ROLE, version } };
      }),
    });
    const body = { ...create, role_id: ROLE, expected_version: 1 };
    const [first, second] = await Promise.all([call(gw, body), call(gw, body)]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect([first.body.code, second.body.code].sort()).toEqual(['CONFLICT', 'ROLE_UPDATED']);
  });

  it.each([
    ['nome curto', { name: 'X' }],
    ['nome longo', { name: 'x'.repeat(81) }],
    ['descrição longa', { description: 'x'.repeat(301) }],
    ['permissões que não são lista', { permissions: 'audit.read' }],
    ['código de permissão inválido', { permissions: ['Audit Read'] }],
    ['permissão que não é texto', { permissions: [1] }],
    ['lista de permissões enorme', { permissions: Array.from({ length: 51 }, (_, index) => `a.p${index}`) }],
    ['justificativa curta', { justification: 'curta' }],
    ['justificativa ausente', { justification: undefined }],
    ['role_id inválido', { role_id: 'x', expected_version: 1 }],
    ['versão inválida', { role_id: ROLE, expected_version: 0 }],
  ])('rejeita %s antes do gateway', async (_label, patch) => {
    const gw = gateway();
    expect(await call(gw, { ...create, ...patch })).toEqual({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    expect(gw.saveRole).not.toHaveBeenCalled();
  });

  it('inativa e reativa papel personalizado com versão e justificativa', async () => {
    const gw = gateway();
    const result = await call(gw, { operation: 'set_role_active', organization_id: TENANT_A, role_id: ROLE, active: false, expected_version: 1, justification: JUSTIFICATION });
    expect(result).toEqual({ status: 200, body: { code: 'ROLE_STATE_CHANGED', role: { id: ROLE, version: 2, active: false } } });
    expect(gw.setRoleActive).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, organizationId: TENANT_A, roleId: ROLE, active: false, expectedVersion: 1, justification: JUSTIFICATION });
  });

  it('rejeita active não booleano ao inativar', async () => {
    const gw = gateway();
    expect(await call(gw, { operation: 'set_role_active', organization_id: TENANT_A, role_id: ROLE, active: 'false', expected_version: 1, justification: JUSTIFICATION })).toEqual({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    expect(gw.setRoleActive).not.toHaveBeenCalled();
  });

  it('recusa inativar papel preestabelecido e audita', async () => {
    const gw = gateway({ setRoleActive: vi.fn(async () => ({ kind: 'immutable' as const })) });
    const result = await call(gw, { operation: 'set_role_active', organization_id: TENANT_A, role_id: ADMIN_ROLE, active: false, expected_version: 1, justification: JUSTIFICATION });
    expect(result).toEqual({ status: 403, body: { code: 'ROLE_IMMUTABLE' } });
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'role.set_active', result: 'denied', reason: 'role_immutable' }));
  });
});

describe('manage-access: atribuição de papéis', () => {
  const assign = { operation: 'assign_role', organization_id: TENANT_A, membership_id: MEMBER, role_id: ROLE, justification: JUSTIFICATION };

  it('atribui e remove papel no vínculo do tenant', async () => {
    const gw = gateway();
    expect(await call(gw, assign)).toEqual({ status: 200, body: { code: 'ROLE_ASSIGNED' } });
    expect(await call(gw, { ...assign, operation: 'remove_role' })).toEqual({ status: 200, body: { code: 'ROLE_REMOVED' } });
    expect(gw.changeAssignment).toHaveBeenNthCalledWith(1, expect.objectContaining({ assign: true, membershipId: MEMBER, roleId: ROLE }));
    expect(gw.changeAssignment).toHaveBeenNthCalledWith(2, expect.objectContaining({ assign: false }));
  });

  it('protege o último administrador', async () => {
    const gw = gateway({ changeAssignment: vi.fn(async () => ({ kind: 'last_admin' as const })) });
    expect(await call(gw, { ...assign, operation: 'remove_role', role_id: ADMIN_ROLE })).toEqual({ status: 409, body: { code: 'LAST_ADMIN_REQUIRED' } });
  });

  it.each([
    ['unavailable', 'ROLE_UNAVAILABLE', 409],
    ['invalid', 'VALIDATION_FAILED', 400],
    ['access_denied', 'ACCESS_DENIED', 403],
  ] as const)('traduz %s da atribuição para %s', async (kind, code, status) => {
    const gw = gateway({ changeAssignment: vi.fn(async () => ({ kind })) });
    expect(await call(gw, assign)).toEqual({ status, body: { code } });
  });

  it.each([{ membership_id: 'x' }, { role_id: undefined }, { justification: 'curta' }])('rejeita entrada inválida %j', async (patch) => {
    const gw = gateway();
    expect((await call(gw, { ...assign, ...patch })).status).toBe(400);
    expect(gw.changeAssignment).not.toHaveBeenCalled();
  });
});

describe('manage-access: MFA e auditoria de negações', () => {
  const aal1 = () => gateway({ authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION, aal: 'aal1' as const })) });

  it.each([
    ['save_role', create, 'role.save'],
    ['set_role_active', { operation: 'set_role_active', organization_id: TENANT_A, role_id: ROLE, active: false, expected_version: 1, justification: JUSTIFICATION }, 'role.set_active'],
    ['assign_role', { operation: 'assign_role', organization_id: TENANT_A, membership_id: MEMBER, role_id: ROLE, justification: JUSTIFICATION }, 'role.assign'],
    ['remove_role', { operation: 'remove_role', organization_id: TENANT_A, membership_id: MEMBER, role_id: ROLE, justification: JUSTIFICATION }, 'role.unassign'],
  ])('exige MFA AAL2 em %s, não executa a mutação e audita a negação', async (_name, body, action) => {
    const gw = aal1();
    expect(await call(gw, body)).toEqual({ status: 403, body: { code: 'MFA_REQUIRED' } });
    expect(gw.saveRole).not.toHaveBeenCalled();
    expect(gw.setRoleActive).not.toHaveBeenCalled();
    expect(gw.changeAssignment).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: ACTOR, action, result: 'denied', reason: 'mfa_required' });
  });

  it('não grava o tenant solicitado nem o alvo quando a permissão é negada', async () => {
    const gw = gateway({ changeAssignment: vi.fn(async () => ({ kind: 'access_denied' as const })) });
    await call(gw, { operation: 'assign_role', organization_id: TENANT_B, membership_id: MEMBER, role_id: ROLE, justification: JUSTIFICATION });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: ACTOR, action: 'role.assign', result: 'denied', reason: 'permission_denied' });
    expect(JSON.stringify((gw.audit as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(TENANT_B);
  });

  it('não registra a justificativa livre nas negações', async () => {
    const gw = gateway({ saveRole: vi.fn(async () => ({ kind: 'not_delegable' as const })) });
    await call(gw, { ...create, permissions: ['platform.manage'] });
    expect(JSON.stringify((gw.audit as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(JUSTIFICATION);
  });
});

describe('manage-access: protocolo', () => {
  it('responde ao preflight e rejeita métodos diferentes de POST', async () => {
    const handler = createManageAccessHandler(gateway());
    expect((await handler(new Request('http://local/manage-access', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(new Request('http://local/manage-access', { method: 'GET' }))).status).toBe(405);
  });

  it('rejeita corpo que não é JSON', async () => {
    const handler = createManageAccessHandler(gateway());
    const response = await handler(new Request('http://local/manage-access', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'não é json' }));
    expect(response.status).toBe(400);
  });

  it('não expõe detalhes internos quando o gateway falha', async () => {
    const gw = gateway({ saveRole: vi.fn(async () => { throw new Error('SQL: relation roles violates constraint'); }) });
    const result = await call(gw, create);
    expect(result).toEqual({ status: 500, body: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(result.body)).not.toMatch(/SQL|constraint/);
  });
});
