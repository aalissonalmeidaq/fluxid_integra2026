// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  PLATFORM_SEAL_OPERATIONS, createPlatformSealsHandler, type PlatformIdentity, type PlatformSealsGateway,
} from '../../supabase/functions/platform-seals/handler';


// Spec 013 (T017): a borda das operações do Master (contracts/operacoes-plataforma.md; research.md, item 7). O banco é falso: as regras
// de verdade estão nas suítes pgTAP 013_approve, 013_conflict, 013_withdraw e 013_forget_networks.
const MASTER: PlatformIdentity = { userId: '10000000-0000-0000-0000-000000000001', sessionId: '60000000-0000-0000-0000-000000000001', aal: 'aal2', sessionActive: true, canManagePlatform: true };
const ENROLLMENT = 'a1340000-0000-0000-0000-000000000001';
const REQUEST = 'b1340000-0000-0000-0000-000000000001';
const TENANT = '20000000-0000-0000-0000-00000000000a';
const AT = '2026-10-19T12:00:00.123456+00:00';

function setup(identity: PlatformIdentity | null = MASTER, result: Record<string, unknown> = { code: 'APPROVED' }) {
  const rpc = vi.fn(async () => result);
  const audit = vi.fn(async () => undefined);
  const gateway: PlatformSealsGateway = { authenticate: vi.fn(async () => identity), rpc, audit };
  return { handler: createPlatformSealsHandler(gateway), rpc, audit };
}
const post = (body: unknown, token = 'token') => new Request('http://x/functions/v1/platform-seals', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const approve = { operation: 'approve_enrollment', request_id: REQUEST, enrollment_id: ENROLLMENT, organization_id: TENANT, justification: 'Lacre conferido', expected_updated_at: AT };

describe('platform-seals', () => {
  it('tem exatamente as nove operações do contrato', () => {
    expect(Object.keys(PLATFORM_SEAL_OPERATIONS).sort()).toEqual([
      'approve_enrollment', 'list_enrollments', 'list_tenants_for_seals', 'refuse_enrollment', 'reopen_enrollment', 'replace_enrollment_key',
      'request_forget_networks', 'reveal_portal_password', 'withdraw_device',
    ]);
  });

  it('sem sessão: 401 sem chamar o banco', async () => {
    const { handler, rpc } = setup(null);
    expect((await handler(post(approve))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('Spec 013 (RF-021): o Master em AAL1 aprova, sem negação por MFA', async () => {
    const { handler, rpc, audit } = setup({ ...MASTER, aal: 'aal1' });
    expect((await handler(post(approve))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('approve_enrollment', expect.objectContaining({ p_actor: MASTER.userId }));
    expect(audit).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'mfa_required' }));
  });

  it('sem platform.manage: ACCESS_DENIED e a negação auditada', async () => {
    const { handler, rpc, audit } = setup({ ...MASTER, canManagePlatform: false });
    const response = await handler(post({ operation: 'list_enrollments', offset: 0, limit: 50 }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'ACCESS_DENIED' });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'seal.enrollment_access', result: 'denied', reason: 'permission_denied' }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('operação desconhecida: recusada e auditada', async () => {
    const { handler, rpc, audit } = setup();
    expect((await handler(post({ operation: 'delete_enrollment' }))).status).toBe(400);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'seal.unknown_operation', result: 'denied' }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('aprova chamando a RPC com o ator e a sessão do token, nunca do corpo', async () => {
    const { handler, rpc } = setup();
    const response = await handler(post({ ...approve, p_actor: 'outra-pessoa' }));
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    const ok = await handler(post(approve));
    expect(ok.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('approve_enrollment', {
      p_actor: MASTER.userId, p_session: MASTER.sessionId, p_request: REQUEST, p_enrollment: ENROLLMENT, p_organization: TENANT,
      p_justification: 'Lacre conferido', p_expected_updated_at: AT,
    });
  });

  it('só a aprovação recebe organization_id (a empresa de destino); nas outras operações ele é recusado', async () => {
    const { handler, rpc } = setup(MASTER, { code: 'REFUSED' });
    const refuse = { operation: 'refuse_enrollment', request_id: REQUEST, enrollment_id: ENROLLMENT, justification: 'Lacre desconhecido', expected_updated_at: AT };
    expect((await handler(post({ ...refuse, organization_id: TENANT }))).status).toBe(400);
    expect((await handler(post(refuse))).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['approve_enrollment', { ...approve, justification: undefined }],
    ['approve_enrollment', { ...approve, request_id: undefined }],
    ['approve_enrollment', { ...approve, expected_updated_at: 'ontem' }],
    ['withdraw_device', { operation: 'withdraw_device', request_id: REQUEST, enrollment_id: ENROLLMENT, forget_networks: 'some', justification: 'Recolhido', expected_updated_at: AT }],
    ['list_enrollments', { operation: 'list_enrollments', offset: 0, limit: 101 }],
    ['list_enrollments', { operation: 'list_enrollments', status: 'blocked', offset: 0, limit: 10 }],
    ['reveal_portal_password', { operation: 'reveal_portal_password', request_id: REQUEST }],
  ])('%s fora do contrato: VALIDATION_FAILED sem chamar o banco', async (_op, body) => {
    const { handler, rpc } = setup();
    const response = await handler(post(body));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('VALIDATION_FAILED');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('cada operação chama a RPC de mesmo nome com os argumentos do contrato', async () => {
    const { handler, rpc } = setup(MASTER, { code: 'LISTED', items: [] });
    await handler(post({ operation: 'list_enrollments', status: 'pending', conflict: true, offset: 0, limit: 100 }));
    expect(rpc).toHaveBeenLastCalledWith('list_enrollments', { p_actor: MASTER.userId, p_session: MASTER.sessionId, p_status: 'pending', p_conflict: true, p_offset: 0, p_limit: 100 });
    await handler(post({ operation: 'list_tenants_for_seals' }));
    expect(rpc).toHaveBeenLastCalledWith('list_tenants_for_seals', { p_actor: MASTER.userId, p_session: MASTER.sessionId });
    await handler(post({ operation: 'replace_enrollment_key', request_id: REQUEST, enrollment_id: ENROLLMENT, keep_current: true, justification: 'Aparelho estranho', expected_updated_at: AT }));
    expect(rpc).toHaveBeenLastCalledWith('replace_enrollment_key', expect.objectContaining({ p_keep_current: true, p_justification: 'Aparelho estranho' }));
    await handler(post({ operation: 'reopen_enrollment', request_id: REQUEST, enrollment_id: ENROLLMENT, justification: 'Revisão concluída', expected_updated_at: AT }));
    expect(rpc).toHaveBeenLastCalledWith('reopen_enrollment', expect.objectContaining({ p_enrollment: ENROLLMENT, p_justification: 'Revisão concluída' }));
    await handler(post({ operation: 'withdraw_device', request_id: REQUEST, enrollment_id: ENROLLMENT, forget_networks: 'all', justification: 'Recolhido', expected_updated_at: AT }));
    expect(rpc).toHaveBeenLastCalledWith('withdraw_device', expect.objectContaining({ p_forget_networks: 'all' }));
    await handler(post({ operation: 'request_forget_networks', request_id: REQUEST, enrollment_id: ENROLLMENT, justification: 'Vai para outra empresa', expected_updated_at: AT }));
    expect(rpc).toHaveBeenLastCalledWith('request_forget_networks', expect.objectContaining({ p_enrollment: ENROLLMENT }));
    await handler(post({ operation: 'reveal_portal_password', request_id: REQUEST, justification: 'Instalação no depósito' }));
    expect(rpc).toHaveBeenLastCalledWith('reveal_portal_password', { p_actor: MASTER.userId, p_session: MASTER.sessionId, p_request: REQUEST, p_justification: 'Instalação no depósito' });
  });

  it.each([
    ['STALE', 409], ['INVALID_STATE', 409], ['ENROLLMENT_CONFLICT', 409], ['TENANT_INACTIVE', 409], ['NETWORKS_NOT_CLEARED', 409],
    ['CYLINDER_IN_TRIP', 409], ['JUSTIFICATION_REQUIRED', 400], ['NOT_FOUND', 404], ['NOT_CONFIGURED', 409],
  ])('o código %s do banco vira HTTP %i com o mesmo corpo', async (code, status) => {
    const { handler } = setup(MASTER, { code });
    const response = await handler(post(approve));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
  });

  it('ACCESS_DENIED vindo do banco também é auditado', async () => {
    const { handler, audit } = setup(MASTER, { code: 'ACCESS_DENIED' });
    expect((await handler(post(approve))).status).toBe(403);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'seal.enrollment_access', result: 'denied', reason: 'permission_denied' }));
  });

  it('falha do banco: 500 e a falha auditada', async () => {
    const rpc = vi.fn(async () => { throw new Error('rpc_failed'); });
    const audit = vi.fn(async () => undefined);
    const handler = createPlatformSealsHandler({ authenticate: async () => MASTER, rpc, audit });
    expect((await handler(post(approve))).status).toBe(500);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ result: 'failed' }));
  });
});
