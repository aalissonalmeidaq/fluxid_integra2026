import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createProfileAvatarHandler, type AvatarGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

const BUCKET = 'avatars';
// Padrão de produção: 10 envios por hora e usuário. O ambiente local pode elevar o limite para as suítes ao vivo.
const configuredLimit = Number((globalThis as RuntimeEnvironment).Deno?.env.get('AVATAR_UPLOADS_PER_HOUR'));
const UPLOADS_PER_HOUR = Number.isInteger(configuredLimit) && configuredLimit >= 1 && configuredLimit <= 1000 ? configuredLimit : 10;
const HOUR_SECONDS = 3600;

function createGateway(): AvatarGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      return { userId: data.user.id, sessionId: claims.session_id };
    },
    async sessionActive({ userId, sessionId }) {
      const { data, error } = await admin.rpc('validate_user_session', { p_user_id: userId, p_session_id: sessionId });
      if (error) throw new Error('rpc_failed');
      return (data as { status?: string } | null)?.status === 'active';
    },
    async allowUpload(userId) {
      const { data, error } = await admin.rpc('take_rate_limit_token', { p_bucket: 'avatar-upload', p_subject: userId, p_limit: UPLOADS_PER_HOUR, p_window_seconds: HOUR_SECONDS });
      if (error) throw new Error('rpc_failed');
      return data === true;
    },
    async currentAvatarPath(userId) {
      const { data, error } = await admin.from('profiles').select('avatar_path').eq('user_id', userId).maybeSingle();
      if (error) throw new Error('profile_query_failed');
      return (data as { avatar_path: string | null } | null)?.avatar_path ?? null;
    },
    async store(path, bytes, contentType) {
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false, cacheControl: '0' });
      if (error) throw new Error('storage_failed');
    },
    async setAvatarPath(userId, path) {
      const { data, error } = await admin.from('profiles').update({ avatar_path: path, updated_at: new Date().toISOString() }).eq('user_id', userId).select('user_id');
      // Perfil inexistente não é sucesso: a referência não foi gravada.
      if (error || !data || data.length === 0) throw new Error('profile_update_failed');
    },
    async remove(path) {
      const { error } = await admin.storage.from(BUCKET).remove([path]);
      if (error) throw new Error('storage_failed');
    },
  };
}

export default { fetch: (request: Request) => createProfileAvatarHandler(createGateway())(request) };
