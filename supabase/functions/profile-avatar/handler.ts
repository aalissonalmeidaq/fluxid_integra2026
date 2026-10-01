import { json, preflight } from '../_shared/http.ts';
import { AVATAR_MAX_BYTES, avatarObjectPath, isCanonicalAvatarPath, validateAvatar } from '../_shared/profile-rules.ts';

export interface AvatarGateway {
  authenticate(token: string): Promise<{ userId: string; sessionId: string } | null>;
  sessionActive(input: { userId: string; sessionId: string }): Promise<boolean>;
  allowUpload(userId: string): Promise<boolean>;
  currentAvatarPath(userId: string): Promise<string | null>;
  store(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  setAvatarPath(userId: string, path: string | null): Promise<void>;
  remove(path: string): Promise<void>;
}

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const swallow = () => undefined;
// Teto do que se descarta ao recusar um corpo grande. A autenticação já ocorreu; nada é armazenado.
const DISCARD_LIMIT_BYTES = 16 * 1024 * 1024;

// Substituição e remoção de avatar. O titular vem do token, o caminho é gerado aqui e o arquivo é validado pelos bytes
// reais; o cliente nunca escreve no bucket (RF-029, RF-030, RS-011). A resposta não expõe caminho nem dados do arquivo.
export function createProfileAvatarHandler(gateway: AvatarGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST' && request.method !== 'DELETE') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);

    try {
      if (!(await gateway.sessionActive(identity))) return json({ code: 'ACCESS_DENIED' }, 403);
      const { userId } = identity;
      return request.method === 'DELETE' ? await remove(gateway, userId) : await replace(gateway, request, userId);
    } catch {
      return json({ code: 'SERVICE_UNAVAILABLE' }, 503);
    }
  };
}

// Descarta o corpo recusado, com teto, e libera o fluxo sem esperar o cancelamento terminar.
async function discardBody(request: Request): Promise<void> {
  const reader = request.body?.getReader();
  if (!reader) return;
  let consumed = 0;
  try {
    while (consumed < DISCARD_LIMIT_BYTES) {
      const { done, value } = await reader.read();
      if (done) return;
      consumed += value.byteLength;
    }
  } catch { /* corpo já interrompido pelo cliente */ } finally {
    reader.cancel().catch(swallow);
  }
}

async function replace(gateway: AvatarGateway, request: Request, userId: string): Promise<Response> {
  // Recusa pelo cabeçalho antes de ler o corpo; a validação abaixo repete a checagem com o tamanho real.
  // O corpo é descartado (com limite) antes de responder: no runtime real, responder sem consumi-lo deixa a requisição pendurada.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > AVATAR_MAX_BYTES) {
    await discardBody(request);
    return json({ code: 'FILE_TOO_LARGE' }, 413);
  }

  const declaredType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  const bytes = new Uint8Array(await request.arrayBuffer());
  const checked = validateAvatar({ declaredType, bytes });
  if (!checked.ok) return json({ code: checked.code }, checked.code === 'FILE_TOO_LARGE' ? 413 : 400);

  if (!(await gateway.allowUpload(userId))) return json({ code: 'RATE_LIMITED' }, 429);

  const previous = await gateway.currentAvatarPath(userId);
  const path = avatarObjectPath(userId, crypto.randomUUID(), checked.extension);

  try { await gateway.store(path, bytes, checked.type); } catch { return json({ code: 'UPLOAD_FAILED' }, 500); }
  try {
    await gateway.setAvatarPath(userId, path);
  } catch {
    // Compensa: a referência nova não valeu, então o objeto novo é removido e o anterior permanece.
    await gateway.remove(path).catch(swallow);
    return json({ code: 'UPLOAD_FAILED' }, 500);
  }
  // O anterior só é excluído depois de a referência nova estar confirmada; sobra órfão apenas se esta limpeza falhar.
  if (previous && previous !== path && isCanonicalAvatarPath(previous, userId)) await gateway.remove(previous).catch(swallow);
  return json({ code: 'AVATAR_UPDATED' });
}

async function remove(gateway: AvatarGateway, userId: string): Promise<Response> {
  const previous = await gateway.currentAvatarPath(userId);
  if (!previous) return json({ code: 'AVATAR_REMOVED' });
  try { await gateway.setAvatarPath(userId, null); } catch { return json({ code: 'UPLOAD_FAILED' }, 500); }
  if (isCanonicalAvatarPath(previous, userId)) await gateway.remove(previous).catch(swallow);
  return json({ code: 'AVATAR_REMOVED' });
}
