import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistryTransport } from '@/application/registry/registry-service';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

// Liga o serviço de cadastros às Edge Functions do destino ativo, só com a chave publicável e o token da sessão da pessoa.
export function createRegistryTransport(endpoint: PublicEndpoint, client: SupabaseClient): RegistryTransport {
  const call = createFunctionTransport(endpoint, client);
  return { call: (fn, body) => call(fn, body) };
}
