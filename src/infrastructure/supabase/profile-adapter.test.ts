import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createProfilePorts } from './profile-adapter';

const USER = '10000000-0000-0000-0000-000000000002';
const endpoint = { url: 'http://127.0.0.1:54321/', publishableKey: 'sb_publishable_teste' };

function fakeClient(options: { token?: string | null; profile?: { data: unknown; error: unknown }; update?: { data: unknown; error: unknown }; signed?: { data: unknown; error: unknown } } = {}) {
  const { token = 'jwt-da-sessao', profile = { data: [], error: null }, update = { data: [{ user_id: USER }], error: null }, signed = { data: { signedUrl: 'https://storage/x' }, error: null } } = options;
  const eqUpdate = vi.fn(() => ({ select: vi.fn(async () => update) }));
  const eqSelect = vi.fn(() => ({ limit: vi.fn(async () => profile) }));
  const from = vi.fn(() => ({ select: vi.fn(() => ({ eq: eqSelect })), update: vi.fn(() => ({ eq: eqUpdate })) }));
  const createSignedUrl = vi.fn(async () => signed);
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token, user: { id: USER } } : null } })) },
    from,
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  } as unknown as SupabaseClient;
  return { client, from, eqSelect, eqUpdate, createSignedUrl };
}

describe('createProfilePorts', () => {
  it('lê somente o perfil do próprio usuário, mesmo que a RLS permita ver perfis de colegas', async () => {
    const { client, eqSelect } = fakeClient({ profile: { data: [{ display_name: 'Ana', locale: 'pt-BR', avatar_path: null }], error: null } });
    expect(await createProfilePorts(endpoint, client).load()).toEqual({ display_name: 'Ana', locale: 'pt-BR', avatar_path: null });
    expect(eqSelect).toHaveBeenCalledWith('user_id', USER);
  });

  it('não devolve perfil sem sessão, sem linha ou com linha malformada', async () => {
    expect(await createProfilePorts(endpoint, fakeClient({ token: null }).client).load()).toBeNull();
    expect(await createProfilePorts(endpoint, fakeClient({ profile: { data: [], error: null } }).client).load()).toBeNull();
    expect(await createProfilePorts(endpoint, fakeClient({ profile: { data: [{ display_name: 1 }], error: null } }).client).load()).toBeNull();
  });

  it('propaga falha de consulta em vez de simular perfil vazio', async () => {
    await expect(createProfilePorts(endpoint, fakeClient({ profile: { data: null, error: { message: 'x' } } }).client).load()).rejects.toThrow('profile_query_failed');
  });

  it('atualiza somente nome e locale do próprio usuário', async () => {
    const { client, eqUpdate } = fakeClient();
    expect(await createProfilePorts(endpoint, client).update({ displayName: 'Ana', locale: 'pt-BR' })).toBe(true);
    expect(eqUpdate).toHaveBeenCalledWith('user_id', USER);
  });

  it('não confirma a atualização quando nenhuma linha foi alterada ou há erro', async () => {
    expect(await createProfilePorts(endpoint, fakeClient({ update: { data: [], error: null } }).client).update({ displayName: 'Ana' })).toBe(false);
    expect(await createProfilePorts(endpoint, fakeClient({ update: { data: null, error: { message: 'x' } } }).client).update({ displayName: 'Ana' })).toBe(false);
    expect(await createProfilePorts(endpoint, fakeClient({ token: null }).client).update({ displayName: 'Ana' })).toBe(false);
  });

  it('envia o avatar como bytes crus, com tipo e credenciais, sem cache e sem caminho escolhido pelo cliente', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 'AVATAR_UPDATED' }), { status: 200 }));
    const bytes = Uint8Array.from([1, 2, 3]);
    const result = await createProfilePorts(endpoint, fakeClient().client, fetcher as unknown as typeof fetch).uploadAvatar(bytes, 'image/png');
    expect(result).toEqual({ status: 200, body: { code: 'AVATAR_UPDATED' } });
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:54321/functions/v1/profile-avatar', {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'image/png', apikey: 'sb_publishable_teste', authorization: 'Bearer jwt-da-sessao' },
      body: bytes,
    });
  });

  it('remove o avatar pelo método DELETE', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 'AVATAR_REMOVED' }), { status: 200 }));
    await createProfilePorts(endpoint, fakeClient().client, fetcher as unknown as typeof fetch).removeAvatar();
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:54321/functions/v1/profile-avatar', expect.objectContaining({ method: 'DELETE', cache: 'no-store' }));
  });

  it('sem sessão não chama o servidor e responde AUTH_REQUIRED', async () => {
    const fetcher = vi.fn();
    const ports = createProfilePorts(endpoint, fakeClient({ token: null }).client, fetcher as unknown as typeof fetch);
    expect(await ports.uploadAvatar(Uint8Array.from([1]), 'image/png')).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(await ports.removeAvatar()).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('preserva o status quando a resposta não é JSON', async () => {
    const fetcher = vi.fn(async () => new Response('<html>', { status: 502 }));
    expect(await createProfilePorts(endpoint, fakeClient().client, fetcher as unknown as typeof fetch).removeAvatar()).toEqual({ status: 502, body: null });
  });

  it('pede a URL assinada ao armazenamento privado com a duração informada', async () => {
    const { client, createSignedUrl } = fakeClient();
    expect(await createProfilePorts(endpoint, client).signedUrl('u/x.png', 60)).toBe('https://storage/x');
    expect(createSignedUrl).toHaveBeenCalledWith('u/x.png', 60);
  });

  it('não devolve URL quando o armazenamento nega ou falha', async () => {
    expect(await createProfilePorts(endpoint, fakeClient({ signed: { data: null, error: { message: 'x' } } }).client).signedUrl('u/x.png', 60)).toBeNull();
  });
});
