import { createClient } from '@supabase/supabase-js';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createSealPushHandler, type PushGateway, type PushSender } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

// A chave VAPID privada e a chave de serviço ficam só aqui, nos segredos da função (RF-040). O banco confere o segredo do Vault que o
// próprio banco mandou no cabeçalho ao chamar esta função.
function createGateway(): PushGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async claim(secret, limit) {
      const { data, error } = await admin.rpc('claim_push_outbox', { p_secret: secret, p_limit: limit });
      if (error) throw new Error('rpc_failed');
      return data as { code: string; items?: [] };
    },
    async report(secret, results) {
      const { error } = await admin.rpc('report_push_results', { p_secret: secret, p_results: results });
      if (error) throw new Error('rpc_failed');
    },
  };
}

const fromBase64Url = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)), (c) => c.charCodeAt(0));
const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let server: Promise<webpush.ApplicationServer> | null = null;
function applicationServer(): Promise<webpush.ApplicationServer> {
  server ??= (async () => {
    const publicKey = fromBase64Url(env('VAPID_PUBLIC_KEY'));
    const x = toBase64Url(publicKey.slice(1, 33));
    const y = toBase64Url(publicKey.slice(33, 65));
    const vapidKeys = await webpush.importVapidKeys({
      publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true },
      privateKey: { kty: 'EC', crv: 'P-256', x, y, d: env('VAPID_PRIVATE_KEY'), ext: true },
    }, { extractable: false });
    return webpush.ApplicationServer.new({ contactInformation: env('VAPID_SUBJECT'), vapidKeys });
  })();
  return server;
}

const sender: PushSender = {
  async send(item) {
    const subscriber = (await applicationServer()).subscribe({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } });
    try {
      await subscriber.pushTextMessage(JSON.stringify({ title: item.title, body: item.body, url: item.url }), { ttl: 3600, urgency: webpush.Urgency.High });
      return 'sent';
    } catch (error) {
      // 404 e 410: a inscrição não existe mais no serviço de push (a biblioteca só trata o 410 em `isGone`).
      if (error instanceof webpush.PushMessageError && (error.isGone() || error.response.status === 404)) return 'gone';
      return { failed: error instanceof webpush.PushMessageError ? `http_${error.response.status}` : 'send_error' };
    }
  },
};

export default { fetch: (request: Request) => createSealPushHandler(createGateway(), sender)(request) };
