import { createClient } from '@supabase/supabase-js';
import { createPasswordRecoveryHandler, type PasswordRecoveryGateway, type RecoveryDelivery } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(key: string): string | undefined } } }
const environment = (name: string): string => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

function gateway(): PasswordRecoveryGateway {
  const url = environment('SUPABASE_URL');
  const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;
  const admin = createClient(url, environment('SUPABASE_SERVICE_ROLE_KEY'), options);
  const publicClient = createClient(url, environment('SUPABASE_ANON_KEY'), options);
  const redirectTo = environment('PASSWORD_RECOVERY_REDIRECT_URL');
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error('rpc_failed');
    return data;
  };

  return {
    reserve: async (identityHash, minimumIntervalSeconds) =>
      Boolean(await rpc('reserve_password_recovery', { p_identity_hash: identityHash, p_interval_seconds: minimumIntervalSeconds })),
    async issue({ email }) {
      const { error } = await publicClient.auth.resetPasswordForEmail(email, { redirectTo });
      return { delivery: (error ? 'failed' : 'confirmed') as RecoveryDelivery };
    },
    audit: async ({ result, identityHash }) => {
      await rpc('record_password_recovery_delivery', {
        p_identity_hash: identityHash,
        p_delivery: result === 'rate_limited' ? 'pending' : result,
      });
    },
  };
}

export default { fetch: (request: Request): Promise<Response> => createPasswordRecoveryHandler(gateway())(request) };
