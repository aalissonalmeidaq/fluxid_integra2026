import { createClient } from '@supabase/supabase-js';
import { createSealGatewayHandler, type SealIngestGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

// A chave de serviço fica só aqui, no servidor; o lacre usa a própria chave, conferida pelo banco (contracts/mensagens-do-lacre.md).
// O sal do endereço de origem é opcional no ambiente local; na nuvem, `SEAL_SOURCE_SALT` deve ser definido como segredo da função.
function createGateway(): SealIngestGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async ingest(deviceCode, keyHashHex, sourceHashHex, body) {
      const { data, error } = await admin.rpc('seal_ingest', {
        p_device_code: deviceCode,
        p_key_hash: keyHashHex ? `\\x${keyHashHex}` : null,
        p_source_hash: sourceHashHex ? `\\x${sourceHashHex}` : null,
        p_body: body,
      });
      if (error) throw new Error('rpc_failed');
      return data;
    },
  };
}

const salt = (globalThis as RuntimeEnvironment).Deno?.env.get('SEAL_SOURCE_SALT') ?? 'fluxid-local';

export default { fetch: (request: Request) => createSealGatewayHandler(createGateway(), salt)(request) };
