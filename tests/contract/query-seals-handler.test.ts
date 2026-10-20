// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQuerySealsHandler, QUERY_SEAL_OPERATIONS } from '../../supabase/functions/query-seals/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 012 (T036): query-seals (contracts/operacoes-servidor.md; RF-037, RF-041). O banco é falso; consulta não audita sucesso.
const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000800a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = 'a1480000-0000-4000-8000-0000000000a1';
const DEV = 'a1400000-0000-4000-8000-0000000000a1';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'LISTED', items: [] }): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown, token = 'jwt', method = 'POST') => new Request('http://local/fn', {
  method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
});

describe('query-seals', () => {
  it('só POST, exige token e responde ao preflight', async () => {
    expect((await createQuerySealsHandler(gateway())(post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await createQuerySealsHandler(gateway())(new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await createQuerySealsHandler(gateway())(post({ operation: 'list_seals', organization_id: ORG }, ''))).status).toBe(401);
  });

  it('operação desconhecida (inclusive exclusão): 400 e auditoria da negação', async () => {
    const gw = gateway();
    for (const operation of ['delete_seal', 'delete_positions', 'bind_seal']) expect((await createQuerySealsHandler(gw)(post({ operation, organization_id: ORG }))).status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'seal.unknown_operation', result: 'denied', reason: 'operation_not_supported' });
  });

  // Spec 013: a lista do tenant mostra só as linhas ativas; as de destinações anteriores vêm com o filtro de histórico.
  it('list_seals aceita o filtro de histórico e o repassa ao banco', async () => {
    const gw = gateway();
    expect((await createQuerySealsHandler(gw)(post({ operation: 'list_seals', organization_id: ORG, history: true }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('list_seals', expect.objectContaining({ p_history: true }));
    expect((await createQuerySealsHandler(gw)(post({ operation: 'list_seals', organization_id: ORG, history: 'sim' }))).status).toBe(400);
  });

  it('nenhuma operação do catálogo escreve ou exclui', () => {
    for (const [name, spec] of Object.entries(QUERY_SEAL_OPERATIONS)) {
      expect(name).not.toMatch(/delete|remove|create|update|bind|request|close/);
      expect(spec.fields).not.toHaveProperty('request_id');
    }
  });

  it('leituras da US1 chamam a RPC com ator e sessão do token, nunca do corpo', async () => {
    const gw = gateway({ code: 'FOUND', seal: null });
    const response = await createQuerySealsHandler(gw)(post({ operation: 'cylinder_seal_view', organization_id: ORG, cylinder_id: CYL, p_actor: 'outro' }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('cylinder_seal_view', { p_actor: USER, p_session: SESSION, p_organization: ORG, p_cylinder: CYL });
  });

  it('list_positions exige cilindro ou dispositivo e respeita o limite', async () => {
    const gw = gateway();
    expect((await createQuerySealsHandler(gw)(post({ operation: 'list_positions', organization_id: ORG, device_id: DEV, limit: 501 }))).status).toBe(400);
    await createQuerySealsHandler(gw)(post({ operation: 'list_positions', organization_id: ORG, device_id: DEV, limit: 500 }));
    expect(gw.rpc).toHaveBeenCalledWith('list_positions', expect.objectContaining({ p_device: DEV, p_limit: 500 }));
  });

  it('seal_geofence_view exige o dispositivo e repassa ao banco', async () => {
    const gw = gateway({ code: 'FOUND', has_position: true, geofence_access: true, geofences: [] });
    expect((await createQuerySealsHandler(gw)(post({ operation: 'seal_geofence_view', organization_id: ORG }))).status).toBe(400);
    expect((await createQuerySealsHandler(gw)(post({ operation: 'seal_geofence_view', organization_id: ORG, device_id: DEV }))).status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('seal_geofence_view', expect.objectContaining({ p_device: DEV }));
  });

  it('NOT_FOUND e ACCESS_DENIED do banco viram 404 e 403', async () => {
    expect((await createQuerySealsHandler(gateway({ code: 'NOT_FOUND' }))(post({ operation: 'get_seal', organization_id: ORG, device_id: DEV }))).status).toBe(404);
    expect((await createQuerySealsHandler(gateway({ code: 'ACCESS_DENIED' }))(post({ operation: 'list_seals', organization_id: ORG }))).status).toBe(403);
  });
});
