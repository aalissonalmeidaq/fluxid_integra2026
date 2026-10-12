// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryCylindersHandler } from '../../supabase/functions/query-cylinders/handler';
import type { CylinderGateway } from '../../supabase/functions/_shared/cylinders';

// Spec 009, RF-002, RF-003, RF-007, RN-005, CA-001: operação `resolve` da consulta de cilindros.
const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000900a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const OTHER = '20000000-0000-4000-8000-00000000000b';
const CYL = '72000000-0000-4000-8000-0000000000a1';

const gateway = (result: Record<string, unknown>): CylinderGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> } => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;

const call = async (body: Record<string, unknown>, result: Record<string, unknown> = { code: 'FOUND' }) => {
  const gw = gateway(result);
  const response = await createQueryCylindersHandler(gw)(new Request('http://local/fn', {
    method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'resolve', organization_id: ORG, ...body }),
  }));
  return { gw, response, json: await response.json() as Record<string, unknown> };
};

describe('query-cylinders: resolve', () => {
  it('chama a função certa com os candidatos sem espaços nas pontas e o ator do token', async () => {
    const { gw } = await call({ candidates: [' 04A23B1C ', '04:A2:3B:1C'] });
    expect(gw.rpc).toHaveBeenCalledWith('query_identifier_resolve', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_candidates: ['04A23B1C', '04:A2:3B:1C'], p_expected_kind: null,
    });
  });

  it('o ator e a sessão nunca vêm do corpo', async () => {
    const { gw } = await call({ candidates: ['QR-1'], actor_id: OTHER, p_actor: OTHER, session_id: OTHER });
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_actor: USER, p_session: SESSION });
  });

  it('passa o tipo esperado e recusa tipo desconhecido', async () => {
    const { gw } = await call({ candidates: ['QR-1'], expected_kind: 'nfc_tag' });
    expect(gw.rpc.mock.calls[0]![1]).toMatchObject({ p_expected_kind: 'nfc_tag' });
    const refused = await call({ candidates: ['QR-1'], expected_kind: 'barcode' });
    expect(refused.response.status).toBe(400);
    expect(refused.gw.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['sem candidatos', undefined],
    ['lista vazia', []],
    ['mais de 3', ['a', 'b', 'c', 'd']],
    ['candidato com mais de 200 caracteres', ['x'.repeat(201)]],
    ['candidato com quebra de linha', ['a\nb']],
    ['candidato vazio', ['  ']],
    ['candidato que não é texto', [123]],
    ['não é lista', 'QR-1'],
  ])('recusa %s com 400, campo "candidates" e nenhuma chamada ao banco', async (_nome, candidates) => {
    const { gw, response, json } = await call({ candidates });
    expect(response.status).toBe(400);
    expect(json.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(json)).toContain('candidates');
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('aceita 1, 2 e 3 candidatos e o limite de 200 caracteres', async () => {
    for (const candidates of [['a'], ['a', 'b'], ['a', 'b', 'c'], ['x'.repeat(200)]]) {
      expect((await call({ candidates })).response.status).toBe(200);
    }
  });

  it('FOUND passa o corpo do banco sem alteração', async () => {
    const found = { code: 'FOUND', cylinder: { id: CYL, serial_number: 'AB-1' }, identifier: { id: 'i', kind: 'qr_code' }, matched: 0 };
    const { response, json } = await call({ candidates: ['QR-1'] }, found);
    expect(response.status).toBe(200);
    expect(json).toEqual(found);
  });

  // CA-001, RN-005: a resposta de "não encontrado" é a mesma para código inexistente e para código de outra organização.
  it('NOT_FOUND é 404 e idêntico para código inexistente e para código de outra organização', async () => {
    const nonexistent = await call({ candidates: ['NAO-EXISTE'] }, { code: 'NOT_FOUND' });
    const otherTenant = await call({ candidates: ['QR-DO-OUTRO-TENANT'] }, { code: 'NOT_FOUND' });
    expect(nonexistent.response.status).toBe(404);
    expect(otherTenant.response.status).toBe(404);
    expect(JSON.stringify(otherTenant.json)).toBe(JSON.stringify(nonexistent.json));
    expect(nonexistent.json).toEqual({ code: 'NOT_FOUND' });
  });

  it('identificador desativado: 404 com o cilindro mínimo', async () => {
    const { response, json } = await call({ candidates: ['QR-OLD'] }, { code: 'NOT_FOUND', deactivated: true, cylinder: { id: CYL, serial_number: 'AB-1' } });
    expect(response.status).toBe(404);
    expect(json).toEqual({ code: 'NOT_FOUND', deactivated: true, cylinder: { id: CYL, serial_number: 'AB-1' } });
  });

  it('negação do banco: 403 e auditada como negada, sem o valor lido', async () => {
    const { gw, response } = await call({ candidates: ['SEGREDO-123'] }, { code: 'ACCESS_DENIED' });
    expect(response.status).toBe(403);
    expect(gw.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(gw.audit.mock.calls)).not.toContain('SEGREDO-123');
  });

  it('sucesso não é auditado pela borda (é leitura)', async () => {
    const { gw } = await call({ candidates: ['QR-1'] });
    expect(gw.audit).not.toHaveBeenCalled();
  });

  it('sem token: 401 e nenhuma chamada ao banco', async () => {
    const gw = gateway({ code: 'FOUND' });
    const response = await createQueryCylindersHandler(gw)(new Request('http://local/fn', { method: 'POST', body: JSON.stringify({ operation: 'resolve', organization_id: ORG, candidates: ['a'] }) }));
    expect(response.status).toBe(401);
    expect(gw.rpc).not.toHaveBeenCalled();
  });
});
