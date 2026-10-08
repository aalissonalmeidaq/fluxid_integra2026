import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createGeocodeAddressHandler, type GeocodeGateway } from './handler.ts';
import { NominatimProvider } from './nominatim-provider.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

// A chave de serviço fica só aqui, no servidor. O ator e a sessão vêm do token validado pelo Auth; o banco confere vínculo,
// papel e permissão e controla o limite de taxa, como na busca de CEP.
function createGateway(): GeocodeGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      return { userId: data.user.id, sessionId: claims.session_id };
    },
    async checkPermission(actorId, sessionId, organizationId) {
      const { data, error } = await admin.rpc('check_registry_permission', {
        p_actor: actorId, p_session: sessionId, p_organization: organizationId, p_permission: 'customer.write',
      });
      if (error || data === null || typeof data !== 'object') throw new Error('rpc_failed');
      const code = (data as { code?: string }).code;
      if (code === 'OK' || code === 'AUTH_REQUIRED' || code === 'ACCESS_DENIED') return code;
      throw new Error('rpc_failed');
    },
    async takeToken(bucket, subject, limit, windowSeconds) {
      const { data, error } = await admin.rpc('take_rate_limit_token', { p_bucket: bucket, p_subject: subject, p_limit: limit, p_window_seconds: windowSeconds });
      if (error || typeof data !== 'boolean') throw new Error('rpc_failed');
      return data;
    },
  };
}

export default {
  fetch: (request: Request) => createGeocodeAddressHandler({
    gateway: createGateway(),
    provider: new NominatimProvider(),
    // Só o código de resultado e a duração: nem o endereço nem a pessoa entram no registro (RF-067).
    log: (event) => console.info(JSON.stringify({ fn: 'geocode-address', ...event })),
  })(request),
};
