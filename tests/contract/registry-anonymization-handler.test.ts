// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageRegistryHandler } from '../../supabase/functions/manage-registry/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 007, US8: as três operações de anonimização na borda (RF-055, RF-056, RF-061). O banco é sempre falso.
const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const ID = '86000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'ANONYMIZED', anonymized_at: '2026-10-07T15:00:00Z' }, aal: 'aal1' | 'aal2' = 'aal2'): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const body = (response: Response) => response.json() as Promise<Record<string, unknown>>;

const driver = { operation: 'anonymize_driver', organization_id: ORG, driver_id: ID, expected_version: 3, reason: 'data_subject_request', justification: 'Pedido do titular dos dados', confirmed: true };
const customer = { operation: 'anonymize_customer', organization_id: ORG, customer_id: ID, expected_version: 2, reason: 'other', justification: 'Encerramento do relacionamento', confirmed: true };
const contact = { operation: 'anonymize_contact', organization_id: ORG, contact_id: ID, reason: 'retention_expired', justification: 'Prazo de retenção vencido', confirmed: true };

describe('anonimização: borda das funções', () => {
  it('com sessão aal2, entrega os argumentos nomeados ao banco', async () => {
    const gw = gateway();
    expect((await createManageRegistryHandler(gw)(post(driver))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('anonymize_driver', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_driver: ID, p_expected_version: 3, p_reason: 'data_subject_request', p_justification: 'Pedido do titular dos dados', p_confirmed: true,
    });
    const second = gateway();
    await createManageRegistryHandler(second)(post(customer));
    expect(second.rpc).toHaveBeenCalledWith('anonymize_customer', expect.objectContaining({ p_customer: ID, p_expected_version: 2, p_reason: 'other' }));
    const third = gateway();
    await createManageRegistryHandler(third)(post(contact));
    expect(third.rpc).toHaveBeenCalledWith('anonymize_contact', expect.objectContaining({ p_contact: ID, p_reason: 'retention_expired' }));
  });

  it.each([[driver], [customer], [contact]])('sem sessão aal2 (%j) responde MFA_REQUIRED (403), audita a negação e não chama o banco', async (request) => {
    const gw = gateway({ code: 'ANONYMIZED' }, 'aal1');
    const response = await createManageRegistryHandler(gw)(post(request));
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ code: 'MFA_REQUIRED' });
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: expect.stringMatching(/anonymize/), result: 'denied', reason: 'mfa_required' });
  });

  it('a falta de confirmed:true chega ao banco, que responde CONFIRMATION_REQUIRED (400)', async () => {
    const gw = gateway({ code: 'CONFIRMATION_REQUIRED' });
    const response = await createManageRegistryHandler(gw)(post({ ...driver, confirmed: undefined }));
    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ code: 'CONFIRMATION_REQUIRED' });
    expect(gw.rpc.mock.calls[0]?.[1]).toMatchObject({ p_confirmed: null });
  });

  it.each([
    ['motivo fora da lista', { reason: 'curiosidade' }, 'reason'],
    ['motivo ausente', { reason: undefined }, 'reason'],
    ['justificativa ausente', { justification: undefined }, 'justification'],
    ['justificativa de mais de 500 caracteres', { justification: 'x'.repeat(501) }, 'justification'],
    ['confirmação que não é booleana', { confirmed: 'sim' }, 'confirmed'],
    ['versão ausente', { expected_version: undefined }, 'expected_version'],
  ] as const)('recusa antes do banco: %s', async (_nome, extra, campo) => {
    const gw = gateway();
    const response = await createManageRegistryHandler(gw)(post({ ...driver, ...extra }));
    expect(response.status).toBe(400);
    expect(((await body(response)).fields as Array<{ field: string }>).map((f) => f.field)).toContain(campo);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['ACTIVE_RECORD', 409], ['ALREADY_ANONYMIZED', 409], ['ANONYMIZED_RECORD', 409], ['VERSION_CONFLICT', 409], ['JUSTIFICATION_REQUIRED', 400], ['ACCESS_DENIED', 403], ['NOT_FOUND', 404],
  ])('mapeia %s para HTTP %i', async (code, status) => {
    expect((await createManageRegistryHandler(gateway({ code }))(post(driver))).status).toBe(status);
  });

  it('a exceção do gatilho `anonymized_record` vira ANONYMIZED_RECORD (409)', async () => {
    const gw: Gateway = { ...gateway(), rpc: vi.fn(async () => { throw new Error('anonymized_record'); }) } as never;
    const response = await createManageRegistryHandler(gw)(post({ operation: 'update_driver', organization_id: ORG, driver_id: ID, expected_version: 1, full_name: 'Nome Qualquer', cnh_category: 'B', cnh_valid_until: '2030-01-31' }));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ code: 'ANONYMIZED_RECORD' });
  });

  it('nenhum valor pessoal volta na resposta nem na auditoria de negação', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    const response = await createManageRegistryHandler(gw)(post({ ...driver, justification: 'Carlos Sigiloso pediu, CPF 52998224725' }));
    expect(JSON.stringify(await body(response))).not.toMatch(/Carlos|52998224725/);
    expect(JSON.stringify(gw.audit.mock.calls)).not.toMatch(/Carlos|52998224725/);
  });
});
