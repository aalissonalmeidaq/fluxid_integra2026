import type { SupabaseClient } from '@supabase/supabase-js';

export interface PublicEndpoint {
  url: string;
  publishableKey: string;
}

export type FunctionCall = (name: string, body: Record<string, unknown>) => Promise<{ status: number; body: unknown }>;

// Chamada autenticada às Edge Functions do destino ativo: somente chave publicável e o token da sessão do usuário.
// Sem sessão nada é enviado; a resposta nunca ecoa token nem chave.
export function createFunctionTransport(
  endpoint: PublicEndpoint,
  client: SupabaseClient,
  fetcher: typeof fetch = fetch,
): FunctionCall {
  const base = `${endpoint.url.replace(/\/+$/, '')}/functions/v1`;

  return async (name, body) => {
    const { data } = await client.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return { status: 401, body: { code: 'AUTH_REQUIRED' } };

    const response = await fetcher(`${base}/${name}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        apikey: endpoint.publishableKey,
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const parsed: unknown = await response.json().catch(() => null);
    return { status: response.status, body: parsed };
  };
}
