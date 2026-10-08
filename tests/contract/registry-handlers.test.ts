// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOperationsHandler, type OperationSpec, type OperationsGateway } from '../../supabase/functions/_shared/operations';
import { createCylinderHandler } from '../../supabase/functions/_shared/cylinders';

// Spec 007: novidades da borda genérica das funções (T025): MFA, exceção do banco, códigos novos, tipos de campo e prefixo.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const ENTITY = '81000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'OK' }, aal: 'aal1' | 'aal2' | undefined = 'aal1', overrides: Partial<OperationsGateway> = {}): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, ...(aal ? { aal } : {}) })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
  ...overrides,
}) as never;

const post = (body: unknown) =>
  new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

const OPERATIONS: Record<string, OperationSpec> = {
  simples: { rpc: 'rpc_simples', fields: { id: [{ t: 'uuid' }, 'p_id'] } },
  anonimizar: {
    rpc: 'anonymize_driver', action: 'driver.anonymize', mfa: true,
    fields: { id: [{ t: 'uuid' }, 'p_driver'], confirmed: [{ t: 'literal-true' }, 'p_confirmed'] },
  },
  formulario: {
    rpc: 'save_form',
    fields: {
      cep: [{ t: 'text', max: 8, pattern: /^\d{8}$/ }, 'p_cep'],
      dias: [{ t: 'int-list', min: 0, max: 6, maxItems: 7, nullable: true, optional: true }, 'p_days'],
      de: [{ t: 'time', nullable: true, optional: true }, 'p_from'],
      centro: [{ t: 'object', fields: { lat: { t: 'number', min: -90, max: 90 }, lng: { t: 'number', min: -180, max: 180 } }, optional: true }, 'p_center'],
      contatos: [{ t: 'objects', maxItems: 2, fields: { name: { t: 'text', max: 120 }, email: { t: 'text', max: 160, nullable: true, optional: true } }, optional: true }, 'p_contacts'],
    },
  },
};

const handler = (gw: Gateway) => createOperationsHandler(gw, OPERATIONS, { prefix: 'registry' });
const body = (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe('MFA na borda (RF-055)', () => {
  it('sem sessão aal2: 403 MFA_REQUIRED, auditoria da negação e nenhuma chamada ao banco', async () => {
    const gw = gateway({ code: 'ANONYMIZED' }, 'aal1');
    const response = await handler(gw)(post({ operation: 'anonimizar', organization_id: ORG, id: ENTITY, confirmed: true }));
    expect(response.status).toBe(403);
    expect(await body(response)).toEqual({ code: 'MFA_REQUIRED' });
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'driver.anonymize', result: 'denied', reason: 'mfa_required' });
  });

  it('identidade sem informação de aal também é recusada', async () => {
    const gw = gateway({ code: 'ANONYMIZED' }, undefined);
    expect((await handler(gw)(post({ operation: 'anonimizar', organization_id: ORG, id: ENTITY, confirmed: true }))).status).toBe(403);
  });

  it('com aal2 a operação segue para o banco', async () => {
    const gw = gateway({ code: 'ANONYMIZED', anonymized_at: '2026-10-07T12:00:00Z' }, 'aal2');
    const response = await handler(gw)(post({ operation: 'anonimizar', organization_id: ORG, id: ENTITY, confirmed: true }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('anonymize_driver', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_driver: ENTITY, p_confirmed: true });
  });

  it('sem confirmed: true a borda recusa antes do banco', async () => {
    const gw = gateway({ code: 'ANONYMIZED' }, 'aal2');
    const response = await handler(gw)(post({ operation: 'anonimizar', organization_id: ORG, id: ENTITY }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('operação sem mfa não exige aal2', async () => {
    const gw = gateway({ code: 'OK' }, 'aal1');
    expect((await handler(gw)(post({ operation: 'simples', organization_id: ORG, id: ENTITY }))).status).toBe(200);
  });
});

describe('exceção do banco traduzida (RF-058)', () => {
  it('anonymized_record vira 409 ANONYMIZED_RECORD, sem virar falha interna', async () => {
    const gw = gateway({}, 'aal1', { rpc: vi.fn(async () => { throw new Error('anonymized_record'); }) });
    const response = await handler(gw)(post({ operation: 'simples', organization_id: ORG, id: ENTITY }));
    expect(response.status).toBe(409);
    expect(await body(response)).toEqual({ code: 'ANONYMIZED_RECORD' });
    expect(gw.audit).not.toHaveBeenCalled();
  });

  it('qualquer outra exceção continua sendo 500 com auditoria de falha', async () => {
    const gw = gateway({}, 'aal1', { rpc: vi.fn(async () => { throw new Error('rpc_failed'); }) });
    const response = await handler(gw)(post({ operation: 'simples', organization_id: ORG, id: ENTITY }));
    expect(response.status).toBe(500);
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'registry.simples', result: 'failed', reason: 'internal_error' });
  });
});

describe('códigos da Spec 007 mapeados para HTTP', () => {
  it.each([
    ['DOCUMENT_CONFLICT', 409], ['PLATE_CONFLICT', 409], ['NAME_CONFLICT', 409], ['INACTIVE_RECORD', 409], ['PARENT_INACTIVE', 409],
    ['CASCADE_CHANGED', 409], ['USER_NOT_ELIGIBLE', 409], ['GEOMETRY_INVALID', 400], ['ANONYMIZED_RECORD', 409], ['ALREADY_ANONYMIZED', 409],
    ['ACTIVE_RECORD', 409], ['CONFIRMATION_REQUIRED', 400], ['VERSION_CONFLICT', 409], ['ALREADY_INACTIVE', 409], ['NOT_FOUND', 404],
  ] as const)('%s responde %s e devolve o corpo do banco', async (code, status) => {
    const gw = gateway({ code, reason: 'x' });
    const response = await handler(gw)(post({ operation: 'simples', organization_id: ORG, id: ENTITY }));
    expect(response.status).toBe(status);
    expect((await body(response)).code).toBe(code);
  });

  it.each(['INACTIVATED', 'REACTIVATED', 'LINKED', 'UNLINKED', 'REVEALED', 'ANONYMIZED', 'STATUS_CHANGED', 'CREATED', 'UPDATED', 'LISTED', 'FOUND'])(
    'sucesso %s responde 200', async (code) => {
      expect((await handler(gateway({ code }))(post({ operation: 'simples', organization_id: ORG, id: ENTITY }))).status).toBe(200);
    });

  it('código desconhecido do banco vira 500 sem detalhe', async () => {
    const response = await handler(gateway({ code: 'ALGO_NOVO' }))(post({ operation: 'simples', organization_id: ORG, id: ENTITY }));
    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({ code: 'INTERNAL_ERROR' });
  });

  it('negação do banco é auditada como denied', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    const response = await handler(gw)(post({ operation: 'simples', organization_id: ORG, id: ENTITY }));
    expect(response.status).toBe(403);
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'registry.simples', result: 'denied', reason: 'permission_denied' });
  });
});

describe('prefixo de auditoria e operação desconhecida', () => {
  it('operação desconhecida (inclusive exclusão) é recusada e auditada com o prefixo da função', async () => {
    const gw = gateway();
    const response = await handler(gw)(post({ operation: 'delete_customer', organization_id: ORG }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'registry.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('os cilindros mantêm o prefixo cylinder', async () => {
    const gw = gateway();
    await createCylinderHandler(gw, {})(post({ operation: 'delete', organization_id: ORG }));
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'cylinder.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  it('operações herdadas de Object.prototype não existem', async () => {
    const gw = gateway();
    expect((await handler(gw)(post({ operation: 'constructor', organization_id: ORG }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});

describe('tipos de campo novos', () => {
  const valido = { operation: 'formulario', organization_id: ORG, cep: '01001000' };

  it('aceita o formulário completo e entrega os argumentos ao banco', async () => {
    const gw = gateway({ code: 'CREATED' });
    const response = await handler(gw)(post({ ...valido, dias: [1, 2, 3], de: '08:00', centro: { lat: -23.55, lng: -46.63 }, contatos: [{ name: 'Maria', email: null }] }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('save_form', expect.objectContaining({
      p_cep: '01001000', p_days: [1, 2, 3], p_from: '08:00', p_center: { lat: -23.55, lng: -46.63 }, p_contacts: [{ name: 'Maria', email: null }],
    }));
  });

  it.each([
    ['CEP fora do padrão', { cep: '0100' }, 'cep'],
    ['dia fora de 0 a 6', { dias: [7] }, 'dias'],
    ['dias repetidos', { dias: [1, 1] }, 'dias'],
    ['lista de dias vazia', { dias: [] }, 'dias'],
    ['horário inválido', { de: '8h' }, 'de'],
    ['centro com latitude fora do intervalo', { centro: { lat: 95, lng: 0 } }, 'centro.lat'],
    ['centro sem longitude', { centro: { lat: 1 } }, 'centro.lng'],
    ['contato sem nome', { contatos: [{ email: 'a@b.invalid' }] }, 'contatos.0.name'],
    ['segundo contato inválido', { contatos: [{ name: 'Ok' }, { name: '' }] }, 'contatos.1.name'],
    ['contatos demais', { contatos: [{ name: 'A1' }, { name: 'B2' }, { name: 'C3' }] }, 'contatos'],
  ] as const)('recusa: %s', async (_nome, extra, campo) => {
    const gw = gateway({ code: 'CREATED' });
    const response = await handler(gw)(post({ ...valido, ...extra }));
    expect(response.status).toBe(400);
    const corpo = await body(response);
    expect((corpo.fields as Array<{ field: string }>).map((f) => f.field)).toContain(campo);
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});
