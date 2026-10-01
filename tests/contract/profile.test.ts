// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createProfileAvatarHandler, type AvatarGateway } from '../../supabase/functions/profile-avatar/handler';
import { AVATAR_MAX_BYTES } from '../../src/domain/identity/profile';

const USER = '10000000-0000-0000-0000-000000000002';
const SESSION = '60000000-0000-0000-0000-000000000001';
const PREVIOUS = `${USER}/90000000-0000-0000-0000-0000000000aa.png`;

const text = (value: string) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
const chunk = (type: string, length: number) => [0, 0, 0, length, ...text(type), ...new Array<number>(length).fill(0), 0, 0, 0, 0];
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = () => Uint8Array.from([...SIGNATURE, ...chunk('IHDR', 13), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);
const apng = () => Uint8Array.from([...SIGNATURE, ...chunk('IHDR', 13), ...chunk('acTL', 8), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);
const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...text('JFIF'), 0, 1, 2, 3, 0xff, 0xd9]);

function gateway(overrides: Partial<AvatarGateway> = {}) {
  const calls: string[] = [];
  const gw: AvatarGateway = {
    authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION })),
    sessionActive: vi.fn(async () => true),
    allowUpload: vi.fn(async () => true),
    currentAvatarPath: vi.fn(async () => PREVIOUS),
    store: vi.fn(async (path: string) => { calls.push(`store:${path}`); }),
    setAvatarPath: vi.fn(async (_user: string, path: string | null) => { calls.push(`set:${path}`); }),
    remove: vi.fn(async (path: string) => { calls.push(`remove:${path}`); }),
    ...overrides,
  };
  return { gw, calls };
}

interface Options { method?: string; token?: string | null; type?: string; body?: Uint8Array | null; url?: string; headers?: Record<string, string> }
async function call(gw: AvatarGateway, options: Options = {}) {
  const { method = 'POST', token = 'jwt', type = 'image/png', body = png(), url = 'http://local/profile-avatar', headers = {} } = options;
  const init: RequestInit = { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(type ? { 'content-type': type } : {}), ...headers } };
  if (body && method !== 'GET' && method !== 'DELETE') init.body = body as unknown as BodyInit;
  const response = await createProfileAvatarHandler(gw)(new Request(url, init));
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

describe('profile-avatar: substituição', () => {
  it('grava no caminho canônico, atualiza a referência e só depois exclui o avatar anterior', async () => {
    const { gw, calls } = gateway();
    const result = await call(gw);
    expect(result).toEqual({ status: 200, body: { code: 'AVATAR_UPDATED' } });
    expect(calls).toHaveLength(3);
    const [store, set, remove] = calls as [string, string, string];
    expect(store).toMatch(new RegExp(`^store:${USER}/[0-9a-f-]{36}\\.png$`));
    expect(set).toBe(store.replace('store:', 'set:'));
    expect(remove).toBe(`remove:${PREVIOUS}`);
    expect(gw.store).toHaveBeenCalledWith(expect.any(String), expect.any(Uint8Array), 'image/png');
  });

  it('normaliza a extensão pelo tipo real do arquivo', async () => {
    const { gw, calls } = gateway();
    await call(gw, { type: 'image/jpeg', body: jpeg() });
    expect(calls[0]).toMatch(/\.jpg$/);
  });

  it('não exclui nada quando não havia avatar anterior', async () => {
    const { gw, calls } = gateway({ currentAvatarPath: vi.fn(async () => null) });
    expect((await call(gw)).status).toBe(200);
    expect(calls.some((entry) => entry.startsWith('remove:'))).toBe(false);
  });

  it('ignora o caminho sugerido pelo cliente na URL ou em cabeçalhos', async () => {
    const { gw, calls } = gateway();
    await call(gw, { url: `http://local/profile-avatar?path=${USER}/../outro/x.png&name=../x.png`, headers: { 'x-avatar-path': '../../outro.png', 'x-file-name': '../x.png' } });
    expect(calls[0]).toMatch(new RegExp(`^store:${USER}/[0-9a-f-]{36}\\.png$`));
    expect(JSON.stringify(calls)).not.toContain('outro');
  });

  it('gera um objeto novo a cada substituição, sem reutilizar o caminho anterior', async () => {
    const { gw, calls } = gateway();
    await call(gw);
    await call(gw);
    const stored = calls.filter((entry) => entry.startsWith('store:'));
    expect(new Set(stored).size).toBe(2);
    expect(stored).not.toContain(`store:${PREVIOUS}`);
  });

  it('compensa a falha ao atualizar a referência: remove o objeto novo e preserva o anterior', async () => {
    const { gw, calls } = gateway({ setAvatarPath: vi.fn(async () => { throw new Error('db'); }) });
    expect(await call(gw)).toEqual({ status: 500, body: { code: 'UPLOAD_FAILED' } });
    const stored = calls.find((entry) => entry.startsWith('store:'))!.replace('store:', '');
    expect(calls).toContain(`remove:${stored}`);
    expect(calls).not.toContain(`remove:${PREVIOUS}`);
  });

  it('a falha da própria compensação não vaza detalhes nem altera a resposta', async () => {
    const { gw } = gateway({
      setAvatarPath: vi.fn(async () => { throw new Error('db: detalhe interno'); }),
      remove: vi.fn(async () => { throw new Error('storage: detalhe interno'); }),
    });
    const result = await call(gw);
    expect(result).toEqual({ status: 500, body: { code: 'UPLOAD_FAILED' } });
    expect(JSON.stringify(result)).not.toMatch(/detalhe interno/);
  });

  it('não atualiza a referência nem exclui o anterior quando a gravação falha', async () => {
    const { gw, calls } = gateway({ store: vi.fn(async () => { throw new Error('storage'); }) });
    expect(await call(gw)).toEqual({ status: 500, body: { code: 'UPLOAD_FAILED' } });
    expect(calls).toEqual([]);
  });

  it('tolera falha ao excluir o avatar anterior: a referência nova já vale', async () => {
    const { gw } = gateway({ remove: vi.fn(async () => { throw new Error('storage'); }) });
    expect(await call(gw)).toEqual({ status: 200, body: { code: 'AVATAR_UPDATED' } });
  });

  it('não expõe caminho, bytes nem tokens na resposta', async () => {
    const { gw } = gateway();
    const result = await call(gw);
    expect(JSON.stringify(result)).not.toMatch(/[0-9a-f-]{36}|jwt|\.png/);
  });
});

describe('profile-avatar: validação do arquivo', () => {
  it.each([
    ['SVG declarado', 'image/svg+xml', text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 400, 'INVALID_FILE_TYPE'],
    ['GIF declarado', 'image/gif', text('GIF89a'), 400, 'INVALID_FILE_TYPE'],
    ['tipo ausente', '', png(), 400, 'INVALID_FILE_TYPE'],
    ['SVG disfarçado de PNG', 'image/png', text('<svg onload="alert(1)"></svg>'), 400, 'INVALID_FILE_CONTENT'],
    ['PNG declarado como JPEG', 'image/jpeg', png(), 400, 'INVALID_FILE_CONTENT'],
    ['PNG animado', 'image/png', apng(), 400, 'INVALID_FILE_CONTENT'],
    ['arquivo vazio', 'image/png', new Uint8Array(), 400, 'INVALID_FILE_CONTENT'],
  ] as const)('recusa %s sem gravar nada', async (_name, type, body, status, code) => {
    const { gw, calls } = gateway();
    expect(await call(gw, { type, body })).toEqual({ status, body: { code } });
    expect(calls).toEqual([]);
    expect(gw.allowUpload).not.toHaveBeenCalled();
  });

  it('recusa arquivo acima de 2 MB', async () => {
    const { gw, calls } = gateway();
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(png());
    expect(await call(gw, { body: big })).toEqual({ status: 413, body: { code: 'FILE_TOO_LARGE' } });
    expect(calls).toEqual([]);
  });

  it('recusa pelo cabeçalho content-length sem ler o corpo', async () => {
    const { gw } = gateway();
    const arrayBuffer = vi.fn();
    const request = { method: 'POST', headers: new Headers({ authorization: 'Bearer jwt', 'content-type': 'image/png', 'content-length': String(AVATAR_MAX_BYTES + 1) }), url: 'http://local/x', arrayBuffer } as unknown as Request;
    const response = await createProfileAvatarHandler(gw)(request);
    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('descarta o corpo recusado sem armazená-lo, para o runtime poder responder', async () => {
    const { gw, calls } = gateway();
    let chunks = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { chunks += 1; if (chunks > 3) controller.close(); else controller.enqueue(new Uint8Array(1024 * 1024)); } });
    const request = { method: 'POST', headers: new Headers({ authorization: 'Bearer jwt', 'content-type': 'image/png', 'content-length': String(3 * 1024 * 1024) }), url: 'http://local/x', body, arrayBuffer: vi.fn() } as unknown as Request;
    const response = await createProfileAvatarHandler(gw)(request);
    expect(response.status).toBe(413);
    expect(chunks).toBeGreaterThan(3);
    expect(calls).toEqual([]);
    expect(gw.allowUpload).not.toHaveBeenCalled();
  });

  it('não fica preso em corpo sem fim: o descarte tem teto', async () => {
    const { gw } = gateway();
    let read = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { read += 1024 * 1024; controller.enqueue(new Uint8Array(1024 * 1024)); } });
    const request = { method: 'POST', headers: new Headers({ authorization: 'Bearer jwt', 'content-type': 'image/png', 'content-length': String(1024 * 1024 * 1024) }), url: 'http://local/x', body, arrayBuffer: vi.fn() } as unknown as Request;
    expect((await createProfileAvatarHandler(gw)(request)).status).toBe(413);
    expect(read).toBeLessThanOrEqual(20 * 1024 * 1024);
  });

  it('aceita exatamente 2 MB', async () => {
    const { gw } = gateway();
    const exact = new Uint8Array(AVATAR_MAX_BYTES);
    exact.set(png());
    expect((await call(gw, { body: exact })).status).toBe(200);
  });
});

describe('profile-avatar: autenticação, autorização e abuso', () => {
  it('exige sessão autenticada', async () => {
    const { gw, calls } = gateway();
    expect((await call(gw, { token: null })).status).toBe(401);
    const denied = gateway({ authenticate: vi.fn(async () => null) });
    expect((await call(denied.gw)).status).toBe(401);
    expect(calls).toEqual([]);
    expect(denied.calls).toEqual([]);
  });

  it('nega sessão encerrada, expirada ou de outro usuário', async () => {
    const { gw, calls } = gateway({ sessionActive: vi.fn(async () => false) });
    expect(await call(gw)).toEqual({ status: 403, body: { code: 'ACCESS_DENIED' } });
    expect(calls).toEqual([]);
    expect(gw.sessionActive).toHaveBeenCalledWith({ userId: USER, sessionId: SESSION });
  });

  it('limita a frequência de envios sem gravar nada', async () => {
    const { gw, calls } = gateway({ allowUpload: vi.fn(async () => false) });
    expect(await call(gw)).toEqual({ status: 429, body: { code: 'RATE_LIMITED' } });
    expect(calls).toEqual([]);
  });

  it('responde indisponível, sem detalhes, quando a verificação de limite falha', async () => {
    const { gw } = gateway({ allowUpload: vi.fn(async () => { throw new Error('db down'); }) });
    const result = await call(gw);
    expect(result).toEqual({ status: 503, body: { code: 'SERVICE_UNAVAILABLE' } });
  });

  it('só o titular da sessão altera o próprio avatar: o usuário vem do token, nunca da requisição', async () => {
    const { gw, calls } = gateway();
    await call(gw, { url: 'http://local/profile-avatar?user_id=20000000-0000-0000-0000-00000000000b', headers: { 'x-user-id': '20000000-0000-0000-0000-00000000000b' } });
    expect(calls[0]).toContain(USER);
    expect(JSON.stringify(calls)).not.toContain('20000000-0000-0000-0000-00000000000b');
  });
});

describe('profile-avatar: remoção', () => {
  it('remove a referência primeiro e só depois o objeto', async () => {
    const { gw, calls } = gateway();
    expect(await call(gw, { method: 'DELETE', type: '' })).toEqual({ status: 200, body: { code: 'AVATAR_REMOVED' } });
    expect(calls).toEqual(['set:null', `remove:${PREVIOUS}`]);
  });

  it('é idempotente quando não há avatar', async () => {
    const { gw, calls } = gateway({ currentAvatarPath: vi.fn(async () => null) });
    expect(await call(gw, { method: 'DELETE', type: '' })).toEqual({ status: 200, body: { code: 'AVATAR_REMOVED' } });
    expect(calls).toEqual([]);
  });

  it('preserva o objeto quando a referência não pôde ser removida', async () => {
    const { gw, calls } = gateway({ setAvatarPath: vi.fn(async () => { throw new Error('db'); }) });
    expect(await call(gw, { method: 'DELETE', type: '' })).toEqual({ status: 500, body: { code: 'UPLOAD_FAILED' } });
    expect(calls).toEqual([]);
  });

  it('exige sessão vigente para remover', async () => {
    const { gw, calls } = gateway({ sessionActive: vi.fn(async () => false) });
    expect((await call(gw, { method: 'DELETE', type: '' })).status).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe('profile-avatar: protocolo', () => {
  it('responde ao preflight e rejeita métodos não suportados', async () => {
    const { gw } = gateway();
    const handler = createProfileAvatarHandler(gw);
    expect((await handler(new Request('http://local/x', { method: 'OPTIONS' }))).status).toBe(204);
    expect((await handler(new Request('http://local/x', { method: 'GET' }))).status).toBe(405);
    expect((await handler(new Request('http://local/x', { method: 'PUT' }))).status).toBe(405);
  });
});
