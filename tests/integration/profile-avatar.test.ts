// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createProfileAvatarHandler, type AvatarGateway } from '../../supabase/functions/profile-avatar/handler';
import { AVATAR_URL_TTL_SECONDS, ProfileService, type ProfilePorts } from '../../src/application/identity/profile-service';
import { AVATAR_MAX_BYTES } from '../../src/domain/identity/profile';

const USER = '10000000-0000-0000-0000-000000000002';
const OTHER = '10000000-0000-0000-0000-000000000003';

const text = (value: string) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
const chunk = (type: string, length: number) => [0, 0, 0, length, ...text(type), ...new Array<number>(length).fill(0), 0, 0, 0, 0];
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (marker = 0) => Uint8Array.from([...SIGNATURE, ...chunk('IHDR', 13), ...chunk('IDAT', 8 + marker), ...chunk('IEND', 0)]);
const jpeg = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...text('JFIF'), 0, 1, 2, 3, 0xff, 0xd9]);

// Armazenamento e perfil em memória, com pontos de falha injetáveis, atrás do gateway real do handler.
function createBackend(options: { failProfileUpdate?: boolean; failStore?: boolean; failRemove?: boolean; allow?: boolean } = {}) {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const profiles = new Map<string, { display_name: string; locale: string; avatar_path: string | null }>([
    [USER, { display_name: 'Ana Souza', locale: 'pt-BR', avatar_path: null }],
    [OTHER, { display_name: 'Beto', locale: 'pt-BR', avatar_path: null }],
  ]);
  const flags = { ...options };
  const gateway: AvatarGateway = {
    authenticate: async (token) => token === 'token-a' ? { userId: USER, sessionId: 's-a' } : token === 'token-b' ? { userId: OTHER, sessionId: 's-b' } : null,
    sessionActive: async () => true,
    allowUpload: async () => flags.allow !== false,
    currentAvatarPath: async (userId) => profiles.get(userId)?.avatar_path ?? null,
    store: async (path, bytes, contentType) => { if (flags.failStore) throw new Error('storage'); objects.set(path, { bytes, contentType }); },
    setAvatarPath: async (userId, path) => {
      if (flags.failProfileUpdate) throw new Error('db');
      const profile = profiles.get(userId);
      if (!profile) throw new Error('profile');
      profile.avatar_path = path;
    },
    remove: async (path) => { if (flags.failRemove) throw new Error('storage'); objects.delete(path); },
  };
  const handler = createProfileAvatarHandler(gateway);
  const signedUrl = vi.fn(async (path: string, ttl: number) => objects.has(path) ? `https://storage.example.invalid/sign/${encodeURIComponent(path)}?ttl=${ttl}` : null);

  const portsFor = (userId: string, token: string): ProfilePorts => ({
    load: async () => profiles.get(userId) ?? null,
    update: async (input) => {
      const profile = profiles.get(userId);
      if (!profile) return false;
      if (input.displayName) profile.display_name = input.displayName;
      return true;
    },
    uploadAvatar: async (bytes, contentType) => {
      const response = await handler(new Request('http://local/profile-avatar', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': contentType }, body: bytes as unknown as BodyInit }));
      return { status: response.status, body: await response.json() };
    },
    removeAvatar: async () => {
      const response = await handler(new Request('http://local/profile-avatar', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }));
      return { status: response.status, body: await response.json() };
    },
    signedUrl,
  });
  return { objects, profiles, flags, handler, signedUrl, serviceFor: (userId = USER, token = 'token-a') => new ProfileService(portsFor(userId, token)), portsFor };
}

describe('avatar: substituição compensada de ponta a ponta', () => {
  it('envia, publica a referência e devolve uma URL assinada curta que aponta para o objeto novo', async () => {
    const backend = createBackend();
    const outcome = await backend.serviceFor().uploadAvatar({ bytes: png(), type: 'image/png', name: 'foto.png' });
    expect(outcome.kind).toBe('success');
    expect(backend.objects.size).toBe(1);
    const [path] = [...backend.objects.keys()];
    expect(path).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.png$`));
    expect(backend.profiles.get(USER)?.avatar_path).toBe(path);
    expect(backend.signedUrl).toHaveBeenLastCalledWith(path, AVATAR_URL_TTL_SECONDS);
    if (outcome.kind === 'success') expect(outcome.value.avatarUrl).toContain(`ttl=${AVATAR_URL_TTL_SECONDS}`);
  });

  it('substituir exclui o objeto anterior somente depois da nova referência e mantém um único objeto', async () => {
    const backend = createBackend();
    const service = backend.serviceFor();
    await service.uploadAvatar({ bytes: png(1), type: 'image/png', name: 'a.png' });
    const first = backend.profiles.get(USER)!.avatar_path!;
    await service.uploadAvatar({ bytes: jpeg(), type: 'image/jpeg', name: 'b.jpg' });
    const second = backend.profiles.get(USER)!.avatar_path!;
    expect(second).not.toBe(first);
    expect(second).toMatch(/\.jpg$/);
    expect([...backend.objects.keys()]).toEqual([second]);
  });

  it('falha ao atualizar a referência: remove o objeto novo, preserva o anterior e o perfil segue igual', async () => {
    const backend = createBackend();
    const service = backend.serviceFor();
    await service.uploadAvatar({ bytes: png(1), type: 'image/png', name: 'a.png' });
    const previous = backend.profiles.get(USER)!.avatar_path!;
    backend.flags.failProfileUpdate = true;
    const outcome = await service.uploadAvatar({ bytes: png(2), type: 'image/png', name: 'b.png' });
    expect(outcome).toEqual({ kind: 'upload_failed' });
    expect(backend.profiles.get(USER)!.avatar_path).toBe(previous);
    expect([...backend.objects.keys()]).toEqual([previous]);
  });

  it('falha ao gravar o objeto: nada muda no perfil nem no armazenamento', async () => {
    const backend = createBackend({ failStore: true });
    const service = backend.serviceFor();
    expect((await service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' })).kind).toBe('upload_failed');
    expect(backend.objects.size).toBe(0);
    expect(backend.profiles.get(USER)!.avatar_path).toBeNull();
  });

  it('falha ao excluir o anterior não desfaz a troca: a referência nova continua válida', async () => {
    const backend = createBackend();
    const service = backend.serviceFor();
    await service.uploadAvatar({ bytes: png(1), type: 'image/png', name: 'a.png' });
    backend.flags.failRemove = true;
    expect((await service.uploadAvatar({ bytes: png(2), type: 'image/png', name: 'b.png' })).kind).toBe('success');
    expect(backend.objects.has(backend.profiles.get(USER)!.avatar_path!)).toBe(true);
  });

  it('remover apaga a referência e o objeto', async () => {
    const backend = createBackend();
    const service = backend.serviceFor();
    await service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' });
    const outcome = await service.removeAvatar();
    expect(outcome).toEqual({ kind: 'success', value: expect.objectContaining({ avatarUrl: null }) });
    expect(backend.objects.size).toBe(0);
    expect(backend.profiles.get(USER)!.avatar_path).toBeNull();
  });
});

describe('avatar: isolamento entre usuários e limites', () => {
  it('cada titular altera somente o próprio avatar, no próprio caminho', async () => {
    const backend = createBackend();
    await backend.serviceFor(USER, 'token-a').uploadAvatar({ bytes: png(1), type: 'image/png', name: 'a.png' });
    await backend.serviceFor(OTHER, 'token-b').uploadAvatar({ bytes: png(2), type: 'image/png', name: 'b.png' });
    const paths = [...backend.objects.keys()];
    expect(paths).toHaveLength(2);
    expect(paths.filter((path) => path.startsWith(`${USER}/`))).toHaveLength(1);
    expect(paths.filter((path) => path.startsWith(`${OTHER}/`))).toHaveLength(1);
    expect(backend.profiles.get(USER)!.avatar_path).toMatch(new RegExp(`^${USER}/`));
    expect(backend.profiles.get(OTHER)!.avatar_path).toMatch(new RegExp(`^${OTHER}/`));
  });

  it('sem sessão válida nenhum objeto é gravado', async () => {
    const backend = createBackend();
    expect((await backend.serviceFor(USER, 'token-invalido').uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' })).kind).toBe('access_denied');
    expect(backend.objects.size).toBe(0);
  });

  it('acima do limite de frequência o envio é negado sem gravar', async () => {
    const backend = createBackend({ allow: false });
    expect((await backend.serviceFor().uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' })).kind).toBe('rate_limited');
    expect(backend.objects.size).toBe(0);
  });

  it('a fronteira servidor recusa o que o cliente deixasse passar: SVG, PNG animado e arquivo enorme', async () => {
    const backend = createBackend();
    const send = async (bytes: Uint8Array, type: string) => backend.handler(new Request('http://local/x', { method: 'POST', headers: { authorization: 'Bearer token-a', 'content-type': type }, body: bytes as unknown as BodyInit }));
    expect((await send(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).status).toBe(400);
    expect((await send(text('<svg onload="x()"/>'), 'image/png')).status).toBe(400);
    const animated = Uint8Array.from([...SIGNATURE, ...chunk('IHDR', 13), ...chunk('acTL', 8), ...chunk('IDAT', 8), ...chunk('IEND', 0)]);
    expect((await send(animated, 'image/png')).status).toBe(400);
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(png());
    expect((await send(big, 'image/png')).status).toBe(413);
    expect(backend.objects.size).toBe(0);
  });

  it('a URL assinada só é pedida para o caminho já publicado no perfil e nunca é pública ou permanente', async () => {
    const backend = createBackend();
    const service = backend.serviceFor();
    await service.uploadAvatar({ bytes: png(), type: 'image/png', name: 'a.png' });
    const outcome = await service.load();
    if (outcome.kind !== 'success') throw new Error('perfil não carregou');
    expect(outcome.value.avatarUrl).toMatch(/^https:\/\/storage\.example\.invalid\/sign\//);
    expect(outcome.value.avatarUrl).not.toMatch(/\/public\//);
    for (const [path, ttl] of backend.signedUrl.mock.calls) {
      expect(path).toBe(backend.profiles.get(USER)!.avatar_path);
      expect(ttl).toBeLessThanOrEqual(300);
    }
  });
});
