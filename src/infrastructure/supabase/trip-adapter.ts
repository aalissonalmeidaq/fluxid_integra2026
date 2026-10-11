import type { SupabaseClient } from '@supabase/supabase-js';
import type { TripTransport } from '@/application/trips/trip-service';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

// Liga o serviço de viagens às Edge Functions do destino ativo, só com a chave publicável e o token da sessão da pessoa.
export function createTripTransport(endpoint: PublicEndpoint, client: SupabaseClient): TripTransport {
  const call = createFunctionTransport(endpoint, client);
  return { call: (fn, body) => call(fn, body) };
}
