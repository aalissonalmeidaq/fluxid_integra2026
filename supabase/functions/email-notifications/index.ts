import { createClient } from '@supabase/supabase-js';
import { createFakeEmailProvider, type EmailProvider } from './email-provider.ts';
import { createEmailNotificationsHandler, type EmailGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const optional = (name: string) => (globalThis as RuntimeEnvironment).Deno?.env.get(name) || undefined;
const env = (name: string) => {
  const value = optional(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

// Segredos só do ambiente da função (Vault/segredos do projeto), nunca do código nem do cliente. O provedor real não existe até ser
// escolhido e autorizado pelo responsável: `EMAIL_PROVIDER` só aceita `fake` (ambiente local e CI). Sem ele, a função responde
// PROVIDER_UNAVAILABLE e não reclama nada.
function createGateway(): EmailGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async claim(secret, limit) {
      const { data, error } = await admin.rpc('claim_email_notifications', { p_secret: secret, p_limit: limit });
      if (error) throw new Error('rpc_failed');
      return data as { code: string; items?: unknown[] };
    },
    async report(secret, results) {
      const { error } = await admin.rpc('report_email_delivery', { p_secret: secret, p_results: results });
      if (error) throw new Error('rpc_failed');
    },
  };
}

// No provedor falso, o cabeçalho `x-email-fake-outcome` simula recusa ou indisponibilidade para os testes ao vivo.
function providerFor(request: Request): EmailProvider | null {
  if (optional('EMAIL_PROVIDER') !== 'fake') return null;
  const outcome = request.headers.get('x-email-fake-outcome');
  return createFakeEmailProvider(outcome === 'rejected' || outcome === 'unavailable' ? outcome : 'accept');
}

export default {
  fetch: (request: Request) =>
    createEmailNotificationsHandler(createGateway(), providerFor(request), { appUrl: optional('FLUXID_APP_URL') ?? 'http://localhost:5173' })(request),
};
