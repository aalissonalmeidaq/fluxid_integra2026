import { describe, expect, it, vi } from 'vitest';
import { RbacService } from './rbac-service';

const ORG = '20000000-0000-0000-0000-00000000000a';
const ROLE = '50000000-0000-0000-0000-0000000000f1';
const MEMBER = '30000000-0000-0000-0000-0000000000f3';
const JUSTIFICATION = 'Alteração aprovada pela gestão';

const role = { id: ROLE, code: 'custom_a', name: 'Auditor', description: '', system: false, active: true, version: 1, permissions: ['audit.read'] };
const permission = { code: 'audit.read', description: 'Consultar auditoria', critical: false, delegable: true };
const ok = (body: unknown, status = 200) => ({ status, body });
const serviceWith = (response: { status: number; body: unknown } | Error) => {
  const call = vi.fn(async () => { if (response instanceof Error) throw response; return response; });
  return { call, service: new RbacService({ call }) };
};

describe('RbacService.list', () => {
  it('devolve papéis, permissões e atribuições e descarta entradas malformadas', async () => {
    const { service, call } = serviceWith(ok({ code: 'ACCESS_LISTED', roles: [role, { id: 1 }], permissions: [permission, null], assignments: [{ membership_id: MEMBER, role_id: ROLE }, {}] }));
    expect(await service.list({ organizationId: ORG })).toEqual({
      kind: 'success', value: { roles: [role], permissions: [permission], assignments: [{ membership_id: MEMBER, role_id: ROLE }] },
    });
    expect(call).toHaveBeenCalledWith({ operation: 'list', organization_id: ORG });
  });

  it('não concede sucesso quando a resposta não traz a lista', async () => {
    expect((await serviceWith(ok({ code: 'ACCESS_LISTED' })).service.list({ organizationId: ORG })).kind).toBe('unavailable');
  });
});

describe('RbacService.saveRole', () => {
  it('cria papel enviando somente os campos do contrato, sem versão', async () => {
    const { service, call } = serviceWith(ok({ code: 'ROLE_CREATED', role: { id: ROLE, version: 1 } }, 201));
    const outcome = await service.saveRole({ organizationId: ORG, name: '  Auditor  ', description: 'Consulta', permissions: ['audit.read'], justification: JUSTIFICATION });
    expect(outcome).toEqual({ kind: 'success', value: { id: ROLE, version: 1 } });
    expect(call).toHaveBeenCalledWith({ operation: 'save_role', organization_id: ORG, name: 'Auditor', description: 'Consulta', permissions: ['audit.read'], justification: JUSTIFICATION });
  });

  it('altera papel enviando o identificador e a versão esperada', async () => {
    const { service, call } = serviceWith(ok({ code: 'ROLE_UPDATED', role: { id: ROLE, version: 2 } }));
    await service.saveRole({ organizationId: ORG, roleId: ROLE, expectedVersion: 1, name: 'Auditor', description: '', permissions: [], justification: JUSTIFICATION });
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ role_id: ROLE, expected_version: 1, permissions: [] }));
  });
});

describe('RbacService: demais operações', () => {
  it('inativa papel com versão e justificativa', async () => {
    const { service, call } = serviceWith(ok({ code: 'ROLE_STATE_CHANGED', role: { id: ROLE, version: 2, active: false } }));
    expect(await service.setRoleActive({ organizationId: ORG, roleId: ROLE, active: false, expectedVersion: 1, justification: JUSTIFICATION })).toEqual({ kind: 'success', value: { id: ROLE, version: 2, active: false } });
    expect(call).toHaveBeenCalledWith({ operation: 'set_role_active', organization_id: ORG, role_id: ROLE, active: false, expected_version: 1, justification: JUSTIFICATION });
  });

  it('atribui e remove papel de um vínculo', async () => {
    const assign = serviceWith(ok({ code: 'ROLE_ASSIGNED' }));
    expect(await assign.service.assignRole({ organizationId: ORG, membershipId: MEMBER, roleId: ROLE, justification: JUSTIFICATION })).toEqual({ kind: 'success', value: undefined });
    expect(assign.call).toHaveBeenCalledWith({ operation: 'assign_role', organization_id: ORG, membership_id: MEMBER, role_id: ROLE, justification: JUSTIFICATION });
    const remove = serviceWith(ok({ code: 'ROLE_REMOVED' }));
    expect((await remove.service.removeRole({ organizationId: ORG, membershipId: MEMBER, roleId: ROLE, justification: JUSTIFICATION })).kind).toBe('success');
    expect(remove.call).toHaveBeenCalledWith(expect.objectContaining({ operation: 'remove_role' }));
  });
});

describe('RbacService: tradução de falhas', () => {
  it.each([
    [403, 'ACCESS_DENIED', 'access_denied'],
    [401, 'AUTH_REQUIRED', 'access_denied'],
    [403, 'MFA_REQUIRED', 'mfa_required'],
    [403, 'PERMISSION_NOT_DELEGABLE', 'not_delegable'],
    [403, 'ROLE_IMMUTABLE', 'immutable'],
    [409, 'CONFLICT', 'conflict'],
    [409, 'ROLE_UNAVAILABLE', 'role_unavailable'],
    [409, 'LAST_ADMIN_REQUIRED', 'last_admin'],
    [400, 'VALIDATION_FAILED', 'invalid'],
    [500, 'INTERNAL_ERROR', 'unavailable'],
    [503, 'QUALQUER_OUTRO', 'unavailable'],
  ] as const)('mapeia %s/%s para %s sem simular sucesso', async (status, code, kind) => {
    const { service } = serviceWith(ok({ code }, status));
    expect((await service.assignRole({ organizationId: ORG, membershipId: MEMBER, roleId: ROLE, justification: JUSTIFICATION })).kind).toBe(kind);
  });

  it('trata 2xx sem o corpo esperado como indisponível', async () => {
    const { service } = serviceWith(ok({ code: 'ROLE_CREATED' }, 201));
    expect((await service.saveRole({ organizationId: ORG, name: 'Auditor', description: '', permissions: [], justification: JUSTIFICATION })).kind).toBe('unavailable');
  });

  it('converte exceção de rede e corpo não JSON em indisponível', async () => {
    expect((await serviceWith(new Error('offline')).service.list({ organizationId: ORG })).kind).toBe('unavailable');
    expect((await serviceWith(ok(null, 502)).service.list({ organizationId: ORG })).kind).toBe('unavailable');
  });
});
