import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformSealTransport } from '@/application/seals/platform-seal-service';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

// Liga o serviço do Master à Edge Function `platform-seals` do destino ativo, só com a chave publicável e o token da sessão (Spec 013).
export function createPlatformSealTransport(endpoint: PublicEndpoint, client: SupabaseClient): PlatformSealTransport {
  const call = createFunctionTransport(endpoint, client);
  return { call: (body) => call('platform-seals', body) };
}
