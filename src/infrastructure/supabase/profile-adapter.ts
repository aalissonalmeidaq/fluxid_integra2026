import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfilePorts, ProfileRow } from '@/application/identity/profile-service';
import type { PublicEndpoint } from './function-transport';

const isRow = (value: unknown): value is ProfileRow => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.display_name === 'string' && typeof row.locale === 'string' && (row.avatar_path === null || typeof row.avatar_path === 'string');
};

export function createProfilePorts(endpoint: PublicEndpoint, client: SupabaseClient, fetcher: typeof fetch = fetch): ProfilePorts {
  const functionUrl = `${endpoint.url.replace(/\/+$/, '')}/functions/v1/profile-avatar`;

  const session = async () => (await client.auth.getSession()).data.session;

  // Quem tem `profile.read` também enxerga perfis de colegas: toda leitura e escrita filtra pelo próprio usuário.
  const send = async (method: 'POST' | 'DELETE', headers: Record<string, string>, body?: Uint8Array): Promise<{ status: number; body: unknown }> => {
    const current = await session();
    if (!current) return { status: 401, body: { code: 'AUTH_REQUIRED' } };
    const response = await fetcher(functionUrl, {
      method,
      cache: 'no-store',
      headers: { ...headers, apikey: endpoint.publishableKey, authorization: `Bearer ${current.access_token}` },
      // Uint8Array é um corpo válido para fetch; o tipo do lib.dom não o reconhece com ArrayBufferLike.
      ...(body ? { body: body as unknown as BodyInit } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  return {
    async load() {
      const current = await session();
      if (!current) return null;
      const { data, error } = await client.from('profiles').select('display_name, locale, avatar_path').eq('user_id', current.user.id).limit(1);
      if (error) throw new Error('profile_query_failed');
      const [row] = Array.isArray(data) ? data : [];
      return isRow(row) ? row : null;
    },
    async update(input) {
      const current = await session();
      if (!current) return false;
      const changes = {
        ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      };
      const { data, error } = await client.from('profiles').update(changes).eq('user_id', current.user.id).select('user_id');
      return !error && Array.isArray(data) && data.length > 0;
    },
    uploadAvatar: (bytes, contentType) => send('POST', { 'content-type': contentType }, bytes),
    removeAvatar: () => send('DELETE', {}),
    async signedUrl(path, ttlSeconds) {
      const { data, error } = await client.storage.from('avatars').createSignedUrl(path, ttlSeconds);
      return error || !data ? null : data.signedUrl;
    },
  };
}
