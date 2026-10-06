import type { SupabaseClient } from '@supabase/supabase-js';
import type { CylinderTransport } from '@/application/cylinders/cylinder-service';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

// Liga o serviço de cilindros às Edge Functions do destino ativo, só com a chave publicável e o token da sessão da pessoa.
export function createCylinderTransport(endpoint: PublicEndpoint, client: SupabaseClient): CylinderTransport {
  const call = createFunctionTransport(endpoint, client);
  return { call: (fn, body) => call(fn, body) };
}
