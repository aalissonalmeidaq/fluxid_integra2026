import type { SupabaseClient } from '@supabase/supabase-js';
import type { TrackingTransport } from '@/application/tracking/tracking-ports';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

// Liga o rastreamento às Edge Functions do destino ativo, só com a chave publicável e o token da sessão da pessoa. O destino é fixo
// para este transporte: erro de autenticação, autorização, validação ou RLS volta como resposta, sem repetição nem troca de destino.
export function createTrackingTransport(endpoint: PublicEndpoint, client: SupabaseClient, fetcher: typeof fetch = fetch): TrackingTransport {
  const call = createFunctionTransport(endpoint, client, fetcher);
  return { call: (fn, body) => call(fn, body) };
}
