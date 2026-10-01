import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createQueryPermissionsHandler, type PermissionsGateway, type PermissionsResult } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

function createGateway(): PermissionsGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      return { userId: data.user.id, sessionId: claims.session_id };
    },
    async query(input) {
      const { data, error } = await admin.rpc('get_actor_permissions', {
        p_actor: input.actorId, p_session: input.sessionId, p_organization: input.organizationId ?? null,
      });
      if (error) throw new Error('rpc_failed');
      return data as PermissionsResult;
    },
  };
}

export default { fetch: (request: Request) => createQueryPermissionsHandler(createGateway())(request) };
