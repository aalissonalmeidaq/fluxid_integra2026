// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryAuditHandler, type AuditGateway } from '../../supabase/functions/query-audit/handler';

const ACTOR = '10000000-0000-0000-0000-000000000002';
const SESSION = '60000000-0000-0000-0000-000000000001';
const TENANT_A = '20000000-0000-0000-0000-00000000000a';
const TENANT_B = '20000000-0000-0000-0000-00000000000b';

const events = [{
  id: 7, organization_id: TENANT_A, actor: { id: ACTOR, display_name: 'Administrador A' }, action: 'role.create', target_type: 'role',
  target_id: 'r1', result: 'success', reason_code: null, justification: 'Papel aprovado', origin: 'database', occurred_at: '2026-09-30T12:00:00+00:00', metadata: {},
}];

function gateway(overrides: Partial<AuditGateway> = {}): AuditGateway {
  return {
    authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION, aal: 'aal1' as const })),
    query: vi.fn(async () => ({ kind: 'listed' as const, events, next: null })),
    audit: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function call(gw: AuditGateway, body: unknown, token: string | null = 'jwt') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await createQueryAuditHandler(gw)(new Request('http://local/query-audit', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const tenant = { scope: 'tenant', organization_id: TENANT_A };

describe('query-audit: consulta do tenant', () => {
  it('lista os eventos do tenant informado e devolve o cursor da próxima página', async () => {
    const next = { occurred_at: '2026-09-30T12:00:00+00:00', id: 7 };
    const gw = gateway({ query: vi.fn(async () => ({ kind: 'listed' as const, events, next })) });
    const result = await call(gw, tenant);
    expect(result).toEqual({ status: 200, body: { code: 'AUDIT_LISTED', events, next } });
    expect(gw.query).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, scope: 'tenant', organizationId: TENANT_A });
  });

  it('repassa somente filtros válidos, o cursor e o limite', async () => {
    const gw = gateway();
    await call(gw, {
      ...tenant, from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z', action: 'role.create', result: 'denied',
      actor_id: ACTOR, target_type: 'role', before: { occurred_at: '2026-01-05T10:00:00Z', id: 12 }, limit: 25,
    });
    expect(gw.query).toHaveBeenCalledWith({
      actorId: ACTOR, sessionId: SESSION, scope: 'tenant', organizationId: TENANT_A,
      from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z', action: 'role.create', result: 'denied', actorFilter: ACTOR,
      targetType: 'role', beforeAt: '2026-01-05T10:00:00Z', beforeId: 12, limit: 25,
    });
  });

  it('não exige MFA para a consulta do tenant', async () => {
    const gw = gateway();
    expect((await call(gw, tenant)).status).toBe(200);
  });

  it('nega acesso sem `audit.read`, audita a negação sem tenant nem alvo e não revela dados', async () => {
    const gw = gateway({ query: vi.fn(async () => ({ kind: 'access_denied' as const })) });
    const result = await call(gw, { scope: 'tenant', organization_id: TENANT_B });
    expect(result).toEqual({ status: 403, body: { code: 'ACCESS_DENIED' } });
    expect(gw.audit).toHaveBeenCalledWith({ actorId: ACTOR, action: 'audit.query', result: 'denied', reason: 'permission_denied' });
    expect(JSON.stringify((gw.audit as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(TENANT_B);
  });

  it('traduz a recusa de parâmetros do servidor em erro de validação', async () => {
    const gw = gateway({ query: vi.fn(async () => ({ kind: 'invalid' as const })) });
    expect(await call(gw, tenant)).toEqual({ status: 400, body: { code: 'VALIDATION_FAILED' } });
  });
});

describe('query-audit: consulta global', () => {
  const global = { scope: 'global' };

  it('exige MFA AAL2, não consulta e audita a negação', async () => {
    const gw = gateway();
    expect(await call(gw, global)).toEqual({ status: 403, body: { code: 'MFA_REQUIRED' } });
    expect(gw.query).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith({ actorId: ACTOR, action: 'audit.query', result: 'denied', reason: 'mfa_required' });
  });

  it('com AAL2 consulta sem informar organização', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION, aal: 'aal2' as const })) });
    expect((await call(gw, global)).status).toBe(200);
    expect(gw.query).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, scope: 'global' });
  });

  it('ignora o identificador de organização enviado no escopo global', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION, aal: 'aal2' as const })) });
    await call(gw, { scope: 'global', organization_id: TENANT_B });
    expect(gw.query).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, scope: 'global' });
  });

  it('nega quem não é Master nem Administrador FluxID, mesmo com AAL2', async () => {
    const gw = gateway({
      authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION, aal: 'aal2' as const })),
      query: vi.fn(async () => ({ kind: 'access_denied' as const })),
    });
    expect(await call(gw, global)).toEqual({ status: 403, body: { code: 'ACCESS_DENIED' } });
  });
});

describe('query-audit: validação e protocolo', () => {
  it.each([
    ['escopo ausente', {}],
    ['escopo desconhecido', { scope: 'todos' }],
    ['tenant sem organização', { scope: 'tenant' }],
    ['organização inválida', { scope: 'tenant', organization_id: 'nao-e-uuid' }],
    ['resultado fora da lista', { ...tenant, result: 'quebrado' }],
    ['ação fora do padrão', { ...tenant, action: 'acao com espaço; drop table' }],
    ['tipo de alvo fora do padrão', { ...tenant, target_type: 'Tipo/Inválido' }],
    ['ator inválido', { ...tenant, actor_id: 'x' }],
    ['data inválida', { ...tenant, from: 'ontem' }],
    ['período invertido', { ...tenant, from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }],
    ['limite acima de 100', { ...tenant, limit: 101 }],
    ['limite zero', { ...tenant, limit: 0 }],
    ['limite não inteiro', { ...tenant, limit: 2.5 }],
    ['cursor incompleto', { ...tenant, before: { id: 3 } }],
    ['cursor com id inválido', { ...tenant, before: { occurred_at: '2026-01-01T00:00:00Z', id: 'x' } }],
  ])('rejeita %s antes do gateway', async (_name, body) => {
    const gw = gateway();
    expect(await call(gw, body)).toEqual({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    expect(gw.query).not.toHaveBeenCalled();
  });

  it('exige sessão autenticada', async () => {
    const gw = gateway();
    expect((await call(gw, tenant, null)).status).toBe(401);
    const denied = gateway({ authenticate: vi.fn(async () => null) });
    expect((await call(denied, tenant)).status).toBe(401);
    expect(denied.query).not.toHaveBeenCalled();
  });

  it('não expõe detalhes internos quando o gateway falha', async () => {
    const gw = gateway({ query: vi.fn(async () => { throw new Error('relation audit_logs: detalhe interno'); }) });
    const result = await call(gw, tenant);
    expect(result).toEqual({ status: 500, body: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(result)).not.toMatch(/detalhe interno|audit_logs/);
  });

  it('responde ao preflight e rejeita métodos diferentes de POST', async () => {
    const handler = createQueryAuditHandler(gateway());
    expect((await handler(new Request('http://local/x', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(new Request('http://local/x', { method: 'GET' }))).status).toBe(405);
  });

  it('rejeita corpo que não é JSON', async () => {
    const handler = createQueryAuditHandler(gateway());
    const response = await handler(new Request('http://local/x', { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: 'não é json' }));
    expect(response.status).toBe(400);
  });

  it('a resposta nunca carrega senha, token ou segredo', async () => {
    const result = await call(gateway(), tenant);
    expect(JSON.stringify(result)).not.toMatch(/senha|password|token|secret|jwt/i);
  });
});
