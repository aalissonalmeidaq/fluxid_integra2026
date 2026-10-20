// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageSealsHandler, MANAGE_SEAL_OPERATIONS } from '../../supabase/functions/manage-seals/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 012: manage-seals (contracts/operacoes-servidor.md; RF-036, RF-036b, RF-041). O banco é falso; as regras estão nas suítes pgTAP.
const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000800a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const REQUEST = 'a0000000-0000-4000-8000-000000000001';
const ALERT = 'a1600000-0000-4000-8000-0000000000a1';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'OK' }): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('manage-seals', () => {
  it('nenhuma operação de exclusão existe, e toda operação exige request_id', () => {
    for (const [name, spec] of Object.entries(MANAGE_SEAL_OPERATIONS)) {
      expect(name).not.toMatch(/^delete|^drop|^purge/);
      expect(spec.fields).toHaveProperty('request_id');
    }
  });

  it('operação desconhecida (inclusive exclusão): 400 e auditoria da negação', async () => {
    const gw = gateway();
    expect((await createManageSealsHandler(gw)(post({ operation: 'delete_alert', organization_id: ORG }))).status).toBe(400);
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'seal.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('encerrar alerta: sem request_id é recusado; com ele, chama a RPC com a observação', async () => {
    const gw = gateway({ code: 'CLOSED' });
    expect((await createManageSealsHandler(gw)(post({ operation: 'close_alert', organization_id: ORG, alert_id: ALERT, note: 'Conferido.' }))).status).toBe(400);
    const response = await createManageSealsHandler(gw)(post({ operation: 'close_alert', organization_id: ORG, request_id: REQUEST, alert_id: ALERT, note: 'Conferido.' }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('close_alert', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST, p_alert: ALERT, p_note: 'Conferido.' });
  });

  it('observação ausente: o banco responde NOTE_REQUIRED (400)', async () => {
    const response = await createManageSealsHandler(gateway({ code: 'NOTE_REQUIRED' }))(post({ operation: 'close_alert', organization_id: ORG, request_id: REQUEST, alert_id: ALERT }));
    expect(response.status).toBe(400);
  });

  it('travar e destravar pelo cilindro, com justificativa; o segundo fator é decidido pelo banco', async () => {
    const gw = gateway({ code: 'REQUESTED', command_id: 'x' });
    const CYL = 'a1880000-0000-4000-8000-0000000000a1';
    const response = await createManageSealsHandler(gw)(post({ operation: 'request_lock', organization_id: ORG, request_id: REQUEST, cylinder_id: CYL, justification: 'Conferência.' }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('request_lock', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST, p_cylinder: CYL, p_justification: 'Conferência.' });
    // Spec 013 (RF-021): destravar não exige segundo fator; a borda leva o pedido direto ao banco.
    const unlock = await createManageSealsHandler(gateway({ code: 'REQUESTED' }))(post({ operation: 'request_unlock', organization_id: ORG, request_id: REQUEST, cylinder_id: CYL, justification: 'Liberar.' }));
    expect(unlock.status).toBe(200);
  });

  // Spec 013 (RF-018; research.md, item 8): o cadastro manual, a chave nova e a desativação saem da borda; entra a devolução.
  it.each(['create_device', 'rotate_device_key', 'deactivate_device'])('%s não existe mais na borda: 400 e a negação auditada', async (operation) => {
    const gw = gateway();
    expect(MANAGE_SEAL_OPERATIONS).not.toHaveProperty(operation);
    const response = await createManageSealsHandler(gw)(post({ operation, organization_id: ORG, request_id: REQUEST, device_id: 'a1400000-0000-4000-8000-0000000000a1', label: 'Lacre' }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'seal.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('devolver à plataforma (Spec 013): request_id, lacre e justificativa; CYLINDER_IN_TRIP vira 409', async () => {
    const gw = gateway({ code: 'RETURNED' });
    const body = { operation: 'return_device', organization_id: ORG, request_id: REQUEST, device_id: 'a1400000-0000-4000-8000-0000000000a1', justification: 'Lacre com defeito.' };
    expect((await createManageSealsHandler(gw)(post(body))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('return_device', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_request: REQUEST,
      p_device: 'a1400000-0000-4000-8000-0000000000a1', p_justification: 'Lacre com defeito.' });
    expect((await createManageSealsHandler(gateway({ code: 'CYLINDER_IN_TRIP' }))(post(body))).status).toBe(409);
    expect((await createManageSealsHandler(gateway({ code: 'JUSTIFICATION_REQUIRED' }))(post(body))).status).toBe(400);
    expect((await createManageSealsHandler(gateway({ code: 'NOT_FOUND' }))(post(body))).status).toBe(404);
  });

  it('vínculo e desvínculo: SEAL_ALREADY_BOUND e CYLINDER_IN_TRIP viram 409', async () => {
    const bind = { operation: 'bind_seal', organization_id: ORG, request_id: REQUEST, device_id: 'a1400000-0000-4000-8000-0000000000a1', cylinder_id: 'a1480000-0000-4000-8000-0000000000a1' };
    expect((await createManageSealsHandler(gateway({ code: 'SEAL_ALREADY_BOUND' }))(post(bind))).status).toBe(409);
    const unbind = { operation: 'unbind_seal', organization_id: ORG, request_id: REQUEST, device_id: 'a1400000-0000-4000-8000-0000000000a1', justification: 'Troca.' };
    expect((await createManageSealsHandler(gateway({ code: 'CYLINDER_IN_TRIP' }))(post(unbind))).status).toBe(409);
  });

  it('redes Wi-Fi (US7): senha de 8 a 63 só na chamada ao banco, nunca na auditoria; risco é booleano', async () => {
    const gw = gateway({ code: 'REQUESTED', command_id: 'k1' });
    const add = { operation: 'wifi_add', organization_id: ORG, request_id: REQUEST, device_id: 'a1400000-0000-4000-8000-0000000000a1', ssid: 'Rede-Deposito', password: 'senha-ficticia-123', open: false, confirm_risk: false };
    expect((await createManageSealsHandler(gw)(post(add))).status).toBe(200);
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('senha-ficticia');
    expect((await createManageSealsHandler(gw)(post({ ...add, password: 'x'.repeat(64) }))).status).toBe(400);
    expect((await createManageSealsHandler(gw)(post({ ...add, ssid: '' }))).status).toBe(400);
    expect((await createManageSealsHandler(gw)(post({ ...add, confirm_risk: 'sim' }))).status).toBe(400);
    const remove = { operation: 'wifi_remove', organization_id: ORG, request_id: REQUEST, device_id: 'a1400000-0000-4000-8000-0000000000a1', ssid: 'R1', confirm_risk: false };
    expect((await createManageSealsHandler(gateway({ code: 'WIFI_NOT_IN_LIST' }))(post(remove))).status).toBe(409);
    expect((await createManageSealsHandler(gateway({ code: 'WIFI_RISK_NOT_CONFIRMED' }))(post(remove))).status).toBe(400);
    const reset = { operation: 'wifi_reset', organization_id: ORG, request_id: REQUEST, device_id: 'a1400000-0000-4000-8000-0000000000a1', justification: 'Rede do cliente mudou.', confirm_risk: true };
    expect((await createManageSealsHandler(gateway({ code: 'REQUESTED', command_id: 'k2' }))(post(reset))).status).toBe(200);
  });

  it('inscrição push só com endereço https', async () => {
    const gw = gateway({ code: 'SUBSCRIBED' });
    const body = { operation: 'push_subscribe', organization_id: ORG, request_id: REQUEST, p256dh: 'p', auth: 'a' };
    expect((await createManageSealsHandler(gw)(post({ ...body, endpoint: 'http://push.example.invalid/x' }))).status).toBe(400);
    expect((await createManageSealsHandler(gw)(post({ ...body, endpoint: 'https://push.example.invalid/x' }))).status).toBe(200);
  });
});
