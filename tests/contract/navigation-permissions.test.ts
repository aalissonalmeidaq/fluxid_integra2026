// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createQueryPermissionsHandler, type PermissionsGateway } from '../../supabase/functions/query-permissions/handler';

const ACTOR = '10000000-0000-0000-0000-000000000002';
const SESSION = '60000000-0000-0000-0000-000000000001';
const TENANT_A = '20000000-0000-0000-0000-00000000000a';

function gateway(overrides: Partial<PermissionsGateway> = {}): PermissionsGateway {
  return {
    authenticate: vi.fn(async () => ({ userId: ACTOR, sessionId: SESSION })),
    query: vi.fn(async () => ({ kind: 'listed' as const, tenant: ['audit.read', 'tenant.manage'], global: [] as string[] })),
    ...overrides,
  };
}

async function call(gw: PermissionsGateway, body: unknown, options: { token?: string | null; method?: string } = {}) {
  const token = options.token === undefined ? 'jwt' : options.token;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const method = options.method ?? 'POST';
  const init: RequestInit = method === 'POST' ? { method, headers, body: JSON.stringify(body) } : { method, headers };
  const response = await createQueryPermissionsHandler(gw)(new Request('http://local/query-permissions', init));
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

describe('query-permissions: consulta das próprias permissões', () => {
  it('devolve somente code, tenant e global no sucesso', async () => {
    const gw = gateway();
    const result = await call(gw, { organization_id: TENANT_A });
    expect(result).toEqual({ status: 200, body: { code: 'PERMISSIONS_LISTED', tenant: ['audit.read', 'tenant.manage'], global: [] } });
    expect(Object.keys(result.body ?? {}).sort()).toEqual(['code', 'global', 'tenant']);
    expect(gw.query).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, organizationId: TENANT_A });
  });

  it('aceita o pedido sem organização e consulta só o escopo global', async () => {
    const gw = gateway();
    expect((await call(gw, {})).status).toBe(200);
    expect(gw.query).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION });
  });

  it('ignora campos extras do pedido', async () => {
    const gw = gateway();
    await call(gw, { organization_id: TENANT_A, scope: 'global', actor_id: 'outra-pessoa', roles: ['x'] });
    expect(gw.query).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION, organizationId: TENANT_A });
  });

  it('trata corpo ausente como pedido sem organização', async () => {
    const gw = gateway();
    const response = await createQueryPermissionsHandler(gw)(new Request('http://local/query-permissions', { method: 'POST', headers: { authorization: 'Bearer jwt' } }));
    expect(response.status).toBe(200);
    expect(gw.query).toHaveBeenCalledWith({ actorId: ACTOR, sessionId: SESSION });
  });

  it('recusa sem Authorization e com token inválido, sem consultar', async () => {
    const gw = gateway();
    expect(await call(gw, {}, { token: null })).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    const invalid = gateway({ authenticate: vi.fn(async () => null) });
    expect(await call(invalid, {})).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    const broken = gateway({ authenticate: vi.fn(async () => { throw new Error('boom'); }) });
    expect(await call(broken, {})).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(gw.query).not.toHaveBeenCalled();
    expect(invalid.query).not.toHaveBeenCalled();
  });

  it('traduz a sessão não vigente do banco em AUTH_REQUIRED', async () => {
    const gw = gateway({ query: vi.fn(async () => ({ kind: 'access_denied' as const })) });
    expect(await call(gw, { organization_id: TENANT_A })).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
  });

  it('recusa organization_id que não é UUID', async () => {
    const gw = gateway();
    for (const value of ['abc', 42, null, {}]) {
      expect(await call(gw, { organization_id: value })).toEqual({ status: 400, body: { code: 'VALIDATION_FAILED' } });
    }
    expect(gw.query).not.toHaveBeenCalled();
  });

  it('aceita somente POST (e OPTIONS para o preflight)', async () => {
    const gw = gateway();
    expect(await call(gw, {}, { method: 'GET' })).toEqual({ status: 405, body: { code: 'METHOD_NOT_ALLOWED' } });
    const preflight = await createQueryPermissionsHandler(gw)(new Request('http://local/query-permissions', { method: 'OPTIONS' }));
    expect(preflight.status).toBeLessThan(300);
  });

  it('responde 500 sem detalhe quando o gateway falha', async () => {
    const gw = gateway({ query: vi.fn(async () => { throw new Error('rpc_failed: detalhe interno'); }) });
    const result = await call(gw, { organization_id: TENANT_A });
    expect(result).toEqual({ status: 500, body: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(result.body)).not.toContain('detalhe');
  });

  it('não depende de gateway de auditoria: a leitura não grava evento (RF-023)', () => {
    expect(Object.keys(gateway()).sort()).toEqual(['authenticate', 'query']);
  });
});

// RF-022: o cliente só usa a chave publicável e a sessão da pessoa; credenciais privilegiadas ficam no servidor.
const ROOT = path.resolve(import.meta.dirname, '../..');
const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? sources(full) : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
});
const clientFiles = [
  ...sources(path.join(ROOT, 'src', 'app', 'navigation')),
  ...sources(path.join(ROOT, 'src', 'domain', 'navigation')),
  path.join(ROOT, 'src', 'application', 'identity', 'permissions-service.ts'),
  path.join(ROOT, 'src', 'app', 'shell', 'navigation-menu.tsx'),
];

describe('query-permissions: o cliente não toca em credencial privilegiada (RF-022)', () => {
  it('o código do menu e do serviço não referencia service_role nem chave secreta', () => {
    expect(clientFiles.length).toBeGreaterThan(5);
    for (const file of clientFiles) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, path.relative(ROOT, file)).not.toMatch(/service_role|SERVICE_ROLE|sb_secret|SECRET_KEY/i);
    }
  });

  it('nenhum arquivo do menu escreve token, chave ou resposta em log', () => {
    for (const file of clientFiles) {
      expect(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file)).not.toMatch(/console\.(log|debug|info|warn|error)/);
    }
  });

  it('a Edge Function usa a chave de serviço só no servidor e não registra nada em log', () => {
    const index = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'query-permissions', 'index.ts'), 'utf8');
    const handler = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'query-permissions', 'handler.ts'), 'utf8');
    expect(index).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(handler).not.toMatch(/service_role|SERVICE_ROLE/i);
    expect(`${index}${handler}`).not.toMatch(/console\./);
  });
});
