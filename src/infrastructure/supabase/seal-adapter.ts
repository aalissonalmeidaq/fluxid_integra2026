import type { SupabaseClient } from '@supabase/supabase-js';
import type { SealTransport } from '@/application/seals/seal-service';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

// Liga o serviço do lacre às Edge Functions do destino ativo, só com a chave publicável e o token da sessão da pessoa.
export function createSealTransport(endpoint: PublicEndpoint, client: SupabaseClient): SealTransport {
  const call = createFunctionTransport(endpoint, client);
  return { call: (fn, body) => call(fn, body) };
}
