import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFunctionTransport } from './function-transport';

const endpoint = { url: 'http://127.0.0.1:54321/', publishableKey: 'sb_publishable_teste' };
const clientWith = (accessToken: string | null) => ({
  auth: { getSession: vi.fn(async () => ({ data: { session: accessToken ? { access_token: accessToken } : null } })) },
}) as unknown as SupabaseClient;

describe('createFunctionTransport', () => {
  it('chama a função do destino ativo com a chave publicável e o token da sessão, sem cache', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 'OK' }), { status: 200 }));
    const call = createFunctionTransport(endpoint, clientWith('jwt-da-sessao'), fetcher as unknown as typeof fetch);
    expect(await call('manage-access', { operation: 'list' })).toEqual({ status: 200, body: { code: 'OK' } });
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:54321/functions/v1/manage-access', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', apikey: 'sb_publishable_teste', authorization: 'Bearer jwt-da-sessao' },
      body: JSON.stringify({ operation: 'list' }),
    });
  });

  it('não chama o servidor sem sessão e responde AUTH_REQUIRED', async () => {
    const fetcher = vi.fn();
    const call = createFunctionTransport(endpoint, clientWith(null), fetcher as unknown as typeof fetch);
    expect(await call('manage-access', {})).toEqual({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('devolve corpo nulo quando a resposta não é JSON, preservando o status', async () => {
    const fetcher = vi.fn(async () => new Response('<html>erro</html>', { status: 502 }));
    const call = createFunctionTransport(endpoint, clientWith('jwt'), fetcher as unknown as typeof fetch);
    expect(await call('manage-access', {})).toEqual({ status: 502, body: null });
  });

  it('propaga falha de rede para o serviço tratar como indisponível', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const call = createFunctionTransport(endpoint, clientWith('jwt'), fetcher as unknown as typeof fetch);
    await expect(call('manage-access', {})).rejects.toThrow('Failed to fetch');
  });

  it('não inclui o token nem a chave em nenhuma resposta devolvida', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 'OK' }), { status: 200 }));
    const call = createFunctionTransport(endpoint, clientWith('jwt-secreto'), fetcher as unknown as typeof fetch);
    expect(JSON.stringify(await call('manage-access', {}))).not.toMatch(/jwt-secreto|sb_publishable/);
  });
});
