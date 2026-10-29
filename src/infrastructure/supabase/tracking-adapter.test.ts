import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createTrackingTransport } from './tracking-adapter';

// Spec 015 (T017): o transporte do rastreamento usa um único destino e nunca troca de destino nem repete a chamada quando o servidor
// responde erro de autenticação, autorização, validação ou RLS (docs/arquitetura-conectividade-supabase.md).
const endpoint = { url: 'https://cloud.example.invalid/', publishableKey: 'sb_publishable_teste' };
const client = (token: string | null = 'jwt-da-sessao') => ({
  auth: { getSession: vi.fn(async () => ({ data: { session: token ? { access_token: token } : null } })) },
}) as unknown as SupabaseClient;
const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('transporte do rastreamento', () => {
  it('chama a Edge Function do destino ativo com a chave publicável e o token da sessão', async () => {
    const fetcher = respond(200, { code: 'FOUND' });
    const transport = createTrackingTransport(endpoint, client(), fetcher);
    expect(await transport.call('query-tracking', { operation: 'get_trip_tracking' })).toEqual({ status: 200, body: { code: 'FOUND' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cloud.example.invalid/functions/v1/query-tracking');
    expect(init.headers).toMatchObject({ apikey: 'sb_publishable_teste', authorization: 'Bearer jwt-da-sessao' });
  });

  it.each([
    [401, 'AUTH_REQUIRED'], [403, 'ACCESS_DENIED'], [400, 'VALIDATION_FAILED'], [404, 'NOT_FOUND'],
  ])('com %i (%s), devolve a resposta sem repetir nem trocar de destino', async (status, code) => {
    const fetcher = respond(status, { code });
    const transport = createTrackingTransport(endpoint, client(), fetcher);
    expect(await transport.call('manage-tracking', { operation: 'ingest_driver_positions' })).toEqual({ status, body: { code } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('sem sessão, nada é enviado', async () => {
    const fetcher = respond(200, {});
    const transport = createTrackingTransport(endpoint, client(null), fetcher);
    expect(await transport.call('query-tracking', {})).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
