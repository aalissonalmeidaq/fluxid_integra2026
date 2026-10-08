// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManageRegistryHandler } from '../../supabase/functions/manage-registry/handler';
import { createQueryRegistryHandler } from '../../supabase/functions/query-registry/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 007, US5 (CA-005, MS-006): nenhum dado pessoal sai pelos manipuladores, exceto a resposta de reveal_document. Os valores abaixo
// são fictícios e conhecidos; o teste procura todos eles em logs, auditoria de negação/falha e respostas de erro. O vazamento em
// banco (eventos e auditoria de sucesso) é provado nas suítes pgTAP e na suíte `.live` de anonimização.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const DRIVER = '86000000-0000-4000-8000-000000000001';
const SENSITIVE = ['52998224725', '529.982.247-25', '12345678900', 'Carlos Motorista Sigiloso', '11987654321', 'carlos@example.invalid'];

const logged: string[] = [];
const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(JSON.stringify(args)); }));
afterEach(() => { logged.length = 0; });

function setup(result: Record<string, unknown> | Error) {
  const audits: unknown[] = [];
  const gateway: OperationsGateway = {
    authenticate: async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' }),
    rpc: async () => { if (result instanceof Error) throw result; return result; },
    audit: async (event) => { audits.push(event); },
  };
  return { audits, manage: createManageRegistryHandler(gateway), query: createQueryRegistryHandler(gateway) };
}
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

const driverBody = { operation: 'create_driver', organization_id: ORG, full_name: 'Carlos Motorista Sigiloso', cpf: '529.982.247-25', cnh_number: '12345678900', cnh_category: 'B', cnh_valid_until: '2030-01-31', phone: '11987654321' };
const customerBody = { operation: 'create_customer', organization_id: ORG, person_type: 'individual', document: '52998224725', legal_name: 'Carlos Motorista Sigiloso', segment: 'other', segment_detail: 'x',
  contacts: [{ name: 'Carlos Motorista Sigiloso', phone: '11987654321', email: 'carlos@example.invalid', is_primary: true }] };

const everything = (value: unknown): string => JSON.stringify(value);
const leaks = (value: unknown): string[] => SENSITIVE.filter((item) => everything(value).includes(item));

describe('manipuladores não devolvem nem registram dado pessoal', () => {
  it.each([
    ['conflito de documento', { code: 'DOCUMENT_CONFLICT', field: 'cpf', entity_id: DRIVER, owner_name: 'Outro Condutor' }, 409],
    ['validação do banco', { code: 'VALIDATION_FAILED', fields: [{ field: 'cpf', message: 'Informe um CPF válido.' }] }, 400],
    ['conflito de versão', { code: 'VERSION_CONFLICT' }, 409],
    ['acesso negado', { code: 'ACCESS_DENIED' }, 403],
    ['usuário inelegível', { code: 'USER_NOT_ELIGIBLE' }, 409],
  ])('erro "%s" não ecoa o corpo da requisição', async (_nome, result, status) => {
    for (const body of [driverBody, customerBody]) {
      const { audits, manage } = setup(result);
      const response = await manage(post(body));
      expect(response.status).toBe(status);
      expect(leaks(await response.json())).toEqual([]);
      expect(leaks(audits)).toEqual([]);
    }
    expect(leaks(logged)).toEqual([]);
  });

  it('falha interna devolve 500 sem detalhe e a auditoria da falha não traz valores', async () => {
    const { audits, manage } = setup(new Error('falha com 52998224725 e Carlos Motorista Sigiloso'));
    const response = await manage(post(driverBody));
    expect(response.status).toBe(500);
    expect(leaks(await response.json())).toEqual([]);
    expect(leaks(audits)).toEqual([]);
    expect(leaks(logged)).toEqual([]);
    expect(audits).toEqual([{ actorId: USER, action: 'driver.create', result: 'failed', reason: 'internal_error' }]);
  });

  it('corpo inválido: a lista de erros por campo cita o campo e a mensagem, nunca o valor enviado', async () => {
    const { manage } = setup({ code: 'CREATED' });
    const response = await manage(post({ ...driverBody, cnh_category: 'ZZZ', phone: '11987654321'.repeat(5) }));
    expect(response.status).toBe(400);
    expect(leaks(await response.json())).toEqual([]);
    expect(leaks(logged)).toEqual([]);
  });

  it('operação desconhecida é auditada sem o corpo', async () => {
    const { audits, manage } = setup({ code: 'CREATED' });
    await manage(post({ ...driverBody, operation: 'delete_driver' }));
    expect(audits).toEqual([{ actorId: USER, action: 'registry.unknown_operation', result: 'denied', reason: 'operation_not_supported' }]);
    expect(leaks(audits)).toEqual([]);
  });

  it('as consultas devolvem só o que o banco entrega: documentos mascarados passam, e nada é acrescentado', async () => {
    const list = { code: 'LISTED', items: [{ id: DRIVER, full_name: 'Maria', cpf_display: '***.***.***-25', cnh_display: '********900' }], total: 1, next: null };
    const { query } = setup(list);
    const response = await query(post({ operation: 'list_drivers', organization_id: ORG, search: '529.982.247-25' }));
    const text = JSON.stringify(await response.json());
    expect(text).toContain('***.***.***-25');
    expect(leaks(text)).toEqual([]);
    expect(leaks(logged)).toEqual([]);
  });

  it('só reveal_document devolve o valor, e a auditoria de negação dele não traz o valor', async () => {
    const { manage } = setup({ code: 'REVEALED', value: '52998224725' });
    const revealed = await manage(post({ operation: 'reveal_document', organization_id: ORG, entity_type: 'driver', entity_id: DRIVER, document: 'cpf' }));
    expect(revealed.status).toBe(200);
    expect((await revealed.json() as { value: string }).value).toBe('52998224725');
    expect(revealed.headers.get('cache-control')).toBe('no-store');
    const denied = setup({ code: 'ACCESS_DENIED' });
    const response = await denied.manage(post({ operation: 'reveal_document', organization_id: ORG, entity_type: 'driver', entity_id: DRIVER, document: 'cpf' }));
    expect(response.status).toBe(403);
    expect(denied.audits).toEqual([{ actorId: USER, action: 'registry.document_reveal', result: 'denied', reason: 'permission_denied' }]);
  });

  it('nenhum manipulador chama console com o corpo da requisição', () => {
    expect(spies.some((spy) => spy.mock.calls.length > 0)).toBe(false);
  });
});
