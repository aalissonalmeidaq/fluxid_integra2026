// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageOrganizationsHandler, type OrganizationGateway } from '../../supabase/functions/manage-organizations/handler';


const ACTOR = '10000000-0000-0000-0000-000000000001';
const TENANT = '20000000-0000-0000-0000-000000000099';

function gateway(overrides: Partial<OrganizationGateway> = {}): OrganizationGateway {
  return {
    authenticate: vi.fn(async () => ({ userId: ACTOR, aal: 'aal2' as const, sessionActive: true, canManagePlatform: true, canManageMaster: true })),
    list: vi.fn(async () => [{ id: TENANT, legal_name: 'Empresa Teste Ltda.', display_name: 'Empresa Teste', status: 'active' as const, version: 1 }]),
    create: vi.fn(async () => ({ id: TENANT, status: 'inactive' as const, version: 1 })),
    changeStatus: vi.fn(async () => ({ id: TENANT, status: 'suspended' as const, version: 2 })),
    inviteFirstAdmin: vi.fn(async () => ({ invitationId: '30000000-0000-0000-0000-000000000099' })),
    audit: vi.fn(async () => undefined),
    ...overrides,
  };
}

const post = (body: unknown, token = 'jwt') => new Request('http://local/manage-organizations', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
});

async function call(gw: OrganizationGateway, body: unknown, token?: string) {
  const response = await createManageOrganizationsHandler(gw)(post(body, token));
  return { status: response.status, body: await response.json() };
}

describe('manage-organizations', () => {
  it('cria tenant válido inativo com MFA e audita sem dados livres', async () => {
    const gw = gateway();
    const result = await call(gw, { operation: 'create', legal_name: 'Empresa Teste Ltda.', display_name: 'Empresa Teste', justification: 'Contrato aprovado' });
    expect(result).toEqual({ status: 201, body: { code: 'ORGANIZATION_CREATED', organization: { id: TENANT, status: 'inactive', version: 1 } } });
    expect(gw.create).toHaveBeenCalledWith({ legalName: 'Empresa Teste Ltda.', displayName: 'Empresa Teste', justification: 'Contrato aprovado' });
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.create', result: 'success', targetId: TENANT }));
    expect(JSON.stringify((gw.audit as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('Empresa Teste Ltda.');
  });

  it('consulta somente organizações pela fronteira autorizada', async () => {
    const result = await call(gateway(), { operation: 'list' });
    expect(result.status).toBe(200);
    expect(result.body.organizations).toHaveLength(1);
  });

  it.each(['suspended', 'inactive', 'active'] as const)('altera estado para %s com justificativa, versão e auditoria', async (status) => {
    const gw = gateway({ changeStatus: vi.fn(async () => ({ id: TENANT, status, version: 2 })) });
    const result = await call(gw, { operation: 'change_status', organization_id: TENANT, status, expected_version: 1, justification: 'Decisão administrativa válida' });
    expect(result.status).toBe(200);
    expect(gw.changeStatus).toHaveBeenCalledWith(expect.objectContaining({ organizationId: TENANT, status, expectedVersion: 1 }));
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.status.change', result: 'success' }));
  });

  it.each(['active', 'suspended', 'deleted'])('rejeita estado inicial %s: a empresa sempre nasce inactive', async (initial) => {
    const gw = gateway();
    const result = await call(gw, { operation: 'create', legal_name: 'Empresa Teste Ltda.', display_name: 'Empresa Teste', initial_status: initial, justification: 'Contrato aprovado' });
    expect(result).toEqual({ status: 400, body: { code: 'INVALID_REQUEST' } });
    expect(gw.create).not.toHaveBeenCalled();
  });

  it('recusa ativação sem administrador ativo com código estável e sem auditar sucesso', async () => {
    const gw = gateway({ changeStatus: vi.fn(async () => ({ kind: 'admin_required' as const })) });
    const result = await call(gw, { operation: 'change_status', organization_id: TENANT, status: 'active', expected_version: 1, justification: 'Ativação solicitada' });
    expect(result).toEqual({ status: 409, body: { code: 'LAST_ADMIN_REQUIRED' } });
    expect(gw.audit).not.toHaveBeenCalledWith(expect.objectContaining({ result: 'success' }));
  });

  it('Spec 013 (RF-021): o Master em AAL1 cria a organização, sem negação por MFA', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => ({ userId: ACTOR, aal: 'aal1' as const, sessionActive: true, canManagePlatform: true, canManageMaster: true })) });
    await call(gw, { operation: 'create', legal_name: 'Empresa Teste Ltda.', display_name: 'Empresa Teste', justification: 'Contrato aprovado' });
    expect(gw.create).toHaveBeenCalled();
    expect(gw.audit).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'mfa_required' }));
  });

  it('nega administrador de tenant e não revela organizações', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => ({ userId: ACTOR, aal: 'aal2' as const, sessionActive: true, canManagePlatform: false, canManageMaster: false })) });
    const result = await call(gw, { operation: 'list' });
    expect(result).toEqual({ status: 403, body: { code: 'ACCESS_DENIED' } });
    expect(gw.list).not.toHaveBeenCalled();
  });

  it('rejeita entrada e justificativa inválidas antes do gateway', async () => {
    const gw = gateway();
    const result = await call(gw, { operation: 'change_status', organization_id: TENANT, status: 'deleted', expected_version: 1, justification: '' });
    expect(result).toEqual({ status: 400, body: { code: 'INVALID_REQUEST' } });
    expect(gw.changeStatus).not.toHaveBeenCalled();
  });

  // Spec 014 (RF-016 a): o banco recusa o primeiro administrador no tenant da demonstração com uma exceção (DEMO_RESTRICTED), que
  // desfaz a escrita; a borda devolve 403 e audita a negação.
  it('DEMO_RESTRICTED no primeiro administrador vira 403 e a negação é auditada', async () => {
    const gw = gateway({ inviteFirstAdmin: vi.fn(async () => { throw new Error('DEMO_RESTRICTED'); }) });
    const result = await call(gw, { operation: 'invite_first_admin', organization_id: TENANT, email: 'pessoa@empresa.com.br', justification: 'Primeiro administrador da demonstração' });
    expect(result).toEqual({ status: 403, body: { code: 'DEMO_RESTRICTED' } });
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'organization.first_admin.invite', result: 'denied', reason: 'demo_restricted', targetId: TENANT }));
    expect(gw.audit).not.toHaveBeenCalledWith(expect.objectContaining({ result: 'success' }));
  });
});
