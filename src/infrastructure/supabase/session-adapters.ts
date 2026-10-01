import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionStore, SessionTransport } from '@/application/identity/session-service';
import type { MfaClient } from '@/application/identity/mfa-service';

interface PublicEndpoint { url: string; publishableKey: string }

// Chamada às Edge Functions de sessão com chave publicável; nenhuma credencial privilegiada existe aqui.
export function createFetchSessionTransport(endpoint: PublicEndpoint, fetcher: typeof fetch = fetch): SessionTransport {
  const base = endpoint.url.replace(/\/+$/, '');
  return {
    async call(name, body, accessToken) {
      const response = await fetcher(`${base}/functions/v1/${name}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          apikey: endpoint.publishableKey,
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const parsed: unknown = await response.json().catch(() => null);
      return { status: response.status, body: parsed };
    },
  };
}

export function createSupabaseSessionStore(client: SupabaseClient): SessionStore {
  return {
    async apply(session) {
      const { error } = await client.auth.setSession(session);
      if (error) throw new Error('Não foi possível aplicar a sessão.');
    },
    async clear() {
      await client.auth.signOut({ scope: 'local' });
    },
    async accessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
  };
}

export function createMfaClient(client: SupabaseClient): MfaClient {
  const mfa = client.auth.mfa;
  return {
    listFactors: () => mfa.listFactors() as unknown as ReturnType<MfaClient['listFactors']>,
    enroll: (params) => mfa.enroll({ factorType: 'totp', ...(params?.friendlyName ? { friendlyName: params.friendlyName } : {}) }) as unknown as ReturnType<MfaClient['enroll']>,
    challenge: (params) => mfa.challenge(params) as unknown as ReturnType<MfaClient['challenge']>,
    verify: (params) => mfa.verify(params) as unknown as ReturnType<MfaClient['verify']>,
    unenroll: (params) => mfa.unenroll(params) as unknown as ReturnType<MfaClient['unenroll']>,
  };
}
