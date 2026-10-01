import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFetchSessionTransport, createMfaClient, createSupabaseSessionStore } from './session-adapters';

const endpoint = { url: 'https://projeto.example.test/', publishableKey: 'sb_publishable_teste' };

describe('createFetchSessionTransport', () => {
  it('chama a Edge Function com chave publicável e o token da sessão atual', async () => {
    const fetcher = vi.fn(async () => Response.json({ code: 'SESSION_ACTIVE' }, { status: 200 }));
    const transport = createFetchSessionTransport(endpoint, fetcher as unknown as typeof fetch);
    const result = await transport.call('session-status', undefined, 'jwt-atual');

    expect(result).toEqual({ status: 200, body: { code: 'SESSION_ACTIVE' } });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://projeto.example.test/functions/v1/session-status');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'sb_publishable_teste', authorization: 'Bearer jwt-atual' });
    expect(init.cache).toBe('no-store');
  });

  it('envia o corpo como JSON e não envia authorization sem token', async () => {
    const fetcher = vi.fn(async () => Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 }));
    const transport = createFetchSessionTransport(endpoint, fetcher as unknown as typeof fetch);
    await transport.call('session-login', { email: 'a@b.co', password: 'x' });

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.co', password: 'x' }));
    expect(init.headers).not.toHaveProperty('authorization');
  });

  it('trata corpo não JSON como corpo vazio em vez de lançar', async () => {
    const fetcher = vi.fn(async () => new Response('erro do gateway', { status: 502 }));
    const transport = createFetchSessionTransport(endpoint, fetcher as unknown as typeof fetch);
    await expect(transport.call('session-status')).resolves.toEqual({ status: 502, body: null });
  });

  it('propaga falha de rede para o serviço decidir', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('rede'); });
    const transport = createFetchSessionTransport(endpoint, fetcher as unknown as typeof fetch);
    await expect(transport.call('session-status')).rejects.toThrow();
  });
});

describe('createSupabaseSessionStore', () => {
  const client = () => ({
    auth: {
      setSession: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt' } } })),
    },
  });

  it('aplica a sessão no cliente único ativo', async () => {
    const c = client();
    await createSupabaseSessionStore(c as unknown as SupabaseClient).apply({ access_token: 'a', refresh_token: 'r' });
    expect(c.auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
  });

  it('limpa somente a sessão local do dispositivo', async () => {
    const c = client();
    await createSupabaseSessionStore(c as unknown as SupabaseClient).clear();
    expect(c.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('lê o token atual e devolve null quando não há sessão', async () => {
    const c = client();
    const store = createSupabaseSessionStore(c as unknown as SupabaseClient);
    await expect(store.accessToken()).resolves.toBe('jwt');
    c.auth.getSession.mockResolvedValueOnce({ data: { session: null as never } });
    await expect(store.accessToken()).resolves.toBeNull();
  });

  it('falha ao aplicar sessão inválida em vez de fingir sucesso', async () => {
    const c = client();
    c.auth.setSession.mockResolvedValueOnce({ error: { message: 'x' } as never });
    await expect(createSupabaseSessionStore(c as unknown as SupabaseClient).apply({ access_token: 'a', refresh_token: 'r' })).rejects.toThrow();
  });
});

describe('createMfaClient', () => {
  it('delega ao cliente de MFA TOTP do Auth', async () => {
    const mfa = {
      listFactors: vi.fn(async () => ({ data: { totp: [] }, error: null })),
      enroll: vi.fn(async () => ({ data: null, error: null })),
      challenge: vi.fn(async () => ({ data: null, error: null })),
      verify: vi.fn(async () => ({ data: null, error: null })),
      unenroll: vi.fn(async () => ({ error: null })),
    };
    const adapter = createMfaClient({ auth: { mfa } } as unknown as SupabaseClient);
    await adapter.enroll();
    await adapter.verify({ factorId: 'f', challengeId: 'c', code: '123456' });
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp' });
    expect(mfa.verify).toHaveBeenCalledWith({ factorId: 'f', challengeId: 'c', code: '123456' });
  });
});
