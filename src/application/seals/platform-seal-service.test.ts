import { describe, expect, it, vi } from 'vitest';
import { PlatformSealService, type PlatformSealTransport } from './platform-seal-service';
import { toEnrollmentView } from './platform-seal-views';

// Spec 013 (T019): o serviço do Master sobre a Edge Function platform-seals. Sem conexão nem chama; cada escrita leva request_id,
// justificativa e o updated_at lido (bloqueio otimista).
const enrollment = toEnrollmentView({
  id: 'e1', device_code: 'DSP-APR13001', status: 'pending', conflict: false, conflict_at: null, conflict_calls: 0, first_seen_at: 'x', last_seen_at: 'x',
  calls: 1, signal_dbm: null, wifi_ssid: null, firmware_version: null, organization: null, device_id: null, last_organization: null, networks_cleared: true,
  forget_networks: null, forget_networks_requested_at: null, decided_at: null, decision_note: null, origin: 'enrollment', updated_at: '2026-10-19 12:00:00+00',
})!;

function setup(response: { status: number; body: unknown } = { status: 200, body: { code: 'APPROVED' } }, online = true) {
  const call = vi.fn(async () => response);
  const service = new PlatformSealService({ call } as PlatformSealTransport, () => online, () => 'req-1');
  return { service, call };
}

describe('PlatformSealService', () => {
  it('lista os pedidos com o filtro e a página', async () => {
    const { service, call } = setup({ status: 200, body: { code: 'LISTED', items: [], total: 0, counts: {}, conflicts: 0, rate_limited_last_24h: 0 } });
    const outcome = await service.listEnrollments({ status: 'pending', conflict: true });
    expect(outcome.kind).toBe('success');
    expect(call).toHaveBeenCalledWith({ operation: 'list_enrollments', status: 'pending', conflict: true, offset: 0, limit: 100 });
  });

  it('lista os tenants ativos', async () => {
    const { service } = setup({ status: 200, body: { code: 'LISTED', items: [{ id: 'org-a', name: 'Tenant A' }] } });
    expect(await service.listTenants()).toEqual({ kind: 'success', value: [{ id: 'org-a', name: 'Tenant A' }] });
  });

  it('aprova com o tenant, a justificativa, o request_id e o updated_at lido', async () => {
    const { service, call } = setup();
    expect((await service.approve(enrollment, 'org-a', ' Lacre conferido ')).kind).toBe('success');
    expect(call).toHaveBeenCalledWith({ operation: 'approve_enrollment', request_id: 'req-1', enrollment_id: 'e1', organization_id: 'org-a',
      justification: 'Lacre conferido', expected_updated_at: '2026-10-19 12:00:00+00' });
  });

  it('recusa, resolve conflito, retira e pede o esquecimento com as operações do contrato', async () => {
    const { service, call } = setup({ status: 200, body: { code: 'REFUSED' } });
    await service.refuse(enrollment, 'Lacre desconhecido');
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'refuse_enrollment', justification: 'Lacre desconhecido' }));
    call.mockResolvedValueOnce({ status: 200, body: { code: 'KEY_REPLACED' } });
    await service.resolveConflict(enrollment, false, 'Lacre reinstalado');
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'replace_enrollment_key', keep_current: false }));
    call.mockResolvedValueOnce({ status: 200, body: { code: 'WITHDRAWN' } });
    await service.withdraw(enrollment, 'all', 'Recolhido');
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'withdraw_device', forget_networks: 'all' }));
    call.mockResolvedValueOnce({ status: 200, body: { code: 'FORGET_REQUESTED' } });
    await service.requestForgetNetworks(enrollment, 'Vai para outro tenant');
    expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'request_forget_networks' }));
  });

  it('justificativa curta nem chega ao servidor', async () => {
    const { service, call } = setup();
    expect(await service.refuse(enrollment, ' ab ')).toEqual({ kind: 'justification_required' });
    expect(call).not.toHaveBeenCalled();
  });

  it('revela a senha com o motivo e devolve só o valor', async () => {
    const { service, call } = setup({ status: 200, body: { code: 'REVEALED', password: 'senha-de-teste' } });
    expect(await service.revealPortalPassword('Instalação no depósito')).toEqual({ kind: 'success', value: 'senha-de-teste' });
    expect(call).toHaveBeenCalledWith({ operation: 'reveal_portal_password', request_id: 'req-1', justification: 'Instalação no depósito' });
  });

  it.each([
    [{ status: 409, body: { code: 'NETWORKS_NOT_CLEARED' } }, 'networks_not_cleared'],
    [{ status: 409, body: { code: 'STALE' } }, 'stale'],
    [{ status: 409, body: { code: 'ENROLLMENT_CONFLICT' } }, 'enrollment_conflict'],
    [{ status: 403, body: { code: 'MFA_REQUIRED' } }, 'mfa_required'],
    [{ status: 401, body: { code: 'AUTH_REQUIRED' } }, 'session_expired'],
    [{ status: 409, body: { code: 'NOT_CONFIGURED' } }, 'not_configured'],
    [{ status: 500, body: { code: 'INTERNAL_ERROR' } }, 'unknown'],
  ])('recusa do servidor vira estado de tela', async (response, kind) => {
    const { service } = setup(response);
    expect((await service.approve(enrollment, 'org-a', 'Lacre conferido')).kind).toBe(kind);
  });

  it('sem conexão não chama o servidor', async () => {
    const { service, call } = setup(undefined, false);
    expect(await service.listEnrollments({})).toEqual({ kind: 'offline' });
    expect(call).not.toHaveBeenCalled();
  });

  it('leitura com falha do servidor fica indisponível, não desconhecida', async () => {
    const { service } = setup({ status: 500, body: null });
    expect((await service.listEnrollments({})).kind).toBe('unavailable');
  });
});
