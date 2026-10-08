import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { loadGeocodingConfig, readRuntimeEnv } from './config.ts';
import { createGeocodeAddressHandler, type GeocodeGateway, type PersonType } from './handler.ts';
import type { GeocodeLocation } from './provider.ts';
import { createGeocodingProvider } from './registry.ts';

const env = (name: string) => {
  const value = readRuntimeEnv(name);
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
    async findCustomer(organizationId, customerId) {
      const { data, error } = await admin.from('customers').select('person_type, status, anonymized_at').eq('id', customerId).eq('organization_id', organizationId).maybeSingle();
      if (error) throw new Error('query_failed');
      const row = data as { person_type?: string; status?: string; anonymized_at?: string | null } | null;
      if (!row || (row.person_type !== 'individual' && row.person_type !== 'legal')) return null;
      return { personType: row.person_type as PersonType, operable: row.status === 'active' && !row.anonymized_at };
    },
    async readCache(organizationId, key) {
      const { data, error } = await admin.rpc('read_geocode_cache', { p_organization: organizationId, p_key: key });
      if (error) throw new Error('rpc_failed');
      return data && typeof data === 'object' ? (data as GeocodeLocation) : null;
    },
    async writeCache(organizationId, key, location, ttlDays) {
      const { error } = await admin.rpc('write_geocode_cache', { p_organization: organizationId, p_key: key, p_location: location, p_ttl_days: ttlDays });
      if (error) throw new Error('rpc_failed');
    },
  };
}

export default {
  fetch: (request: Request) => {
    const config = loadGeocodingConfig(readRuntimeEnv);
    return createGeocodeAddressHandler({
      gateway: createGateway(),
      // Desligada, o provedor nem é instanciado.
      provider: config.enabled ? createGeocodingProvider(config.provider) : null,
      config,
      // Só identificador da operação, provedor, duração, status e código de erro sanitizado: nem endereço, nem URL, nem pessoa.
      log: (event) => console.info(JSON.stringify({ fn: 'geocode-address', ...event })),
    })(request);
  },
};
