// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRetentionCleanupHandler, type CleanupGateway } from '../../supabase/functions/retention-storage-cleanup/handler';

const SECRET = 'segredo-da-rotina-de-retencao';
const item = (path: string, bucket = 'avatars') => ({ bucket, path });

function gateway(overrides: Partial<CleanupGateway> = {}) {
  const calls: string[] = [];
  const gw: CleanupGateway = {
    secret: vi.fn(() => SECRET),
    takeBatch: vi.fn(async () => [item('u1/a.png'), item('u2/b.png')]),
    removeObjects: vi.fn(async (bucket: string, paths: string[]) => { calls.push(`remove:${bucket}:${paths.join(',')}`); }),
    complete: vi.fn(async (paths: string[]) => { calls.push(`complete:${paths.join(',')}`); return paths.length; }),
    ...overrides,
  };
  return { gw, calls };
}

async function call(gw: CleanupGateway, options: { method?: string; secret?: string | null; body?: unknown } = {}) {
  const { method = 'POST', secret = SECRET, body } = options;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== null) headers['x-retention-secret'] = secret;
  const response = await createRetentionCleanupHandler(gw)(new Request('http://local/retention-storage-cleanup', { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

describe('retention-storage-cleanup: autenticação', () => {
  it('nega requisição sem o segredo ou com segredo errado, sem tocar na fila', async () => {
    const { gw } = gateway();
    expect((await call(gw, { secret: null })).status).toBe(401);
    expect((await call(gw, { secret: 'errado' })).status).toBe(401);
    expect((await call(gw, { secret: '' })).status).toBe(401);
    expect(gw.takeBatch).not.toHaveBeenCalled();
  });

  it('falha fechado quando o segredo não está configurado', async () => {
    const { gw } = gateway({ secret: vi.fn(() => undefined) });
    expect(await call(gw)).toEqual({ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } });
    expect(gw.takeBatch).not.toHaveBeenCalled();
    const empty = gateway({ secret: vi.fn(() => '') });
    expect((await call(empty.gw, { secret: '' })).status).toBe(503);
  });

  it('compara o segredo sem depender de prefixo: um prefixo válido não autoriza', async () => {
    const { gw } = gateway();
    expect((await call(gw, { secret: SECRET.slice(0, -1) })).status).toBe(401);
    expect((await call(gw, { secret: `${SECRET}x` })).status).toBe(401);
  });

  it('responde ao preflight e aceita somente POST', async () => {
    const { gw } = gateway();
    const handler = createRetentionCleanupHandler(gw);
    expect((await handler(new Request('http://local/x', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await call(gw, { method: 'GET' })).status).toBe(405);
    expect((await call(gw, { method: 'DELETE' })).status).toBe(405);
  });
});

describe('retention-storage-cleanup: limpeza', () => {
  it('remove os objetos pelo Storage e só depois conclui os itens da fila', async () => {
    const { gw, calls } = gateway();
    expect(await call(gw)).toEqual({ status: 200, body: { code: 'CLEANUP_DONE', removed: 2, failed: 0 } });
    expect(calls).toEqual(['remove:avatars:u1/a.png,u2/b.png', 'complete:u1/a.png,u2/b.png']);
  });

  it('agrupa por bucket e conclui cada grupo depois da sua remoção', async () => {
    const { gw, calls } = gateway({ takeBatch: vi.fn(async () => [item('u1/a.png'), item('x/y.png', 'outro'), item('u2/b.png')]) });
    await call(gw);
    expect(calls).toEqual(['remove:avatars:u1/a.png,u2/b.png', 'complete:u1/a.png,u2/b.png', 'remove:outro:x/y.png', 'complete:x/y.png']);
  });

  it('mantém na fila o grupo cuja remoção falhou, sem abortar os demais', async () => {
    const { gw, calls } = gateway({
      takeBatch: vi.fn(async () => [item('u1/a.png'), item('x/y.png', 'outro')]),
      removeObjects: vi.fn(async (bucket: string) => { if (bucket === 'avatars') throw new Error('storage'); calls.push(`remove:${bucket}`); }),
    });
    expect(await call(gw)).toEqual({ status: 200, body: { code: 'CLEANUP_DONE', removed: 1, failed: 1 } });
    expect(calls).toContain('complete:x/y.png');
    expect(calls).not.toContain('complete:u1/a.png');
  });

  it('fila vazia é sucesso sem chamar o Storage', async () => {
    const { gw } = gateway({ takeBatch: vi.fn(async () => []) });
    expect(await call(gw)).toEqual({ status: 200, body: { code: 'CLEANUP_DONE', removed: 0, failed: 0 } });
    expect(gw.removeObjects).not.toHaveBeenCalled();
    expect(gw.complete).not.toHaveBeenCalled();
  });

  it('respeita o limite pedido dentro da faixa segura', async () => {
    const { gw } = gateway();
    await call(gw, { body: { limit: 25 } });
    expect(gw.takeBatch).toHaveBeenLastCalledWith(25);
    await call(gw, { body: { limit: 100000 } });
    expect(gw.takeBatch).toHaveBeenLastCalledWith(500);
    await call(gw, { body: { limit: 'abc' } });
    expect(gw.takeBatch).toHaveBeenLastCalledWith(100);
    await call(gw);
    expect(gw.takeBatch).toHaveBeenLastCalledWith(100);
  });

  it('não expõe caminhos, nomes de usuário nem detalhes do Storage na resposta', async () => {
    const { gw } = gateway({ removeObjects: vi.fn(async () => { throw new Error('storage: u1/a.png não removido'); }) });
    const result = await call(gw);
    expect(JSON.stringify(result)).not.toMatch(/u1\/a\.png|storage:/);
  });

  it('responde indisponível, sem detalhes, quando a fila não pode ser lida', async () => {
    const { gw } = gateway({ takeBatch: vi.fn(async () => { throw new Error('db: relation private.storage_cleanup_queue'); }) });
    const result = await call(gw);
    expect(result).toEqual({ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private.');
  });

  it('a falha ao concluir não é reportada como remoção bem-sucedida', async () => {
    const { gw } = gateway({ complete: vi.fn(async () => { throw new Error('db'); }) });
    expect(await call(gw)).toEqual({ status: 200, body: { code: 'CLEANUP_DONE', removed: 0, failed: 2 } });
  });
});
