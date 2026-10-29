import { buildEmailMessage, type EmailItem, type EmailProvider } from './email-provider.ts';

// Envio dos avisos por e-mail (Spec 015, US6; contracts/avisos-email.md). Chamada pelo banco (`pg_net`, quando o endereço da função foi
// configurado) ou pela operação, sempre com o segredo do Vault no cabeçalho; o banco confere o segredo ao entregar o lote. Sem provedor
// escolhido e autorizado, não reclama nada. Lote curto, tempo limite por envio, e o relato leva só id, resultado, referência opaca e
// código sanitizado: nunca endereço, corpo ou mensagem do provedor. Nada é registrado em log.

export interface EmailGateway {
  claim(secret: string, limit: number): Promise<{ code: string; items?: unknown[] }>;
  report(secret: string, results: DeliveryResult[]): Promise<unknown>;
}

export type DeliveryResult =
  | { id: string; outcome: 'sent'; provider_ref: string }
  | { id: string; outcome: 'retry' | 'failed'; error_code: string };

export interface EmailHandlerOptions {
  appUrl: string;
  batch?: number;
  timeoutMs?: number;
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const CODE = /^[A-Z_]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIES = ['proximity_confirmed', 'seal_high_critical', 'seal_recovered'];

function isItem(value: unknown): value is EmailItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && UUID.test(item.id) && typeof item.to === 'string' && /^[^\s@]+@[^\s@]+$/.test(item.to)
    && typeof item.category === 'string' && CATEGORIES.includes(item.category) && typeof item.path === 'string' && /^\/[a-z0-9/-]+$/i.test(item.path)
    && typeof item.organization === 'string' && typeof item.occurred_at === 'string';
}

async function deliver(provider: EmailProvider, item: EmailItem, appUrl: string, timeoutMs: number): Promise<DeliveryResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), timeoutMs); });
  try {
    const result = await Promise.race([provider.send(buildEmailMessage(item, appUrl)), timeout]);
    if (result === 'timeout') return { id: item.id, outcome: 'retry', error_code: 'PROVIDER_TIMEOUT' };
    if (result.ok) return { id: item.id, outcome: 'sent', provider_ref: String(result.ref).slice(0, 200) };
    if (result.permanent) return { id: item.id, outcome: 'failed', error_code: CODE.test(result.code) ? result.code : 'DELIVERY_REJECTED' };
    return { id: item.id, outcome: 'retry', error_code: CODE.test(result.code) ? result.code : 'PROVIDER_UNAVAILABLE' };
  } catch {
    return { id: item.id, outcome: 'retry', error_code: 'PROVIDER_UNAVAILABLE' };
  } finally {
    clearTimeout(timer);
  }
}

export function createEmailNotificationsHandler(gateway: EmailGateway, provider: EmailProvider | null, options: EmailHandlerOptions) {
  const batch = options.batch ?? 20;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    const secret = request.headers.get('x-email-notifications-secret');
    if (!secret) return reply(401, { code: 'AUTH_REQUIRED' });
    if (!provider) return reply(503, { code: 'PROVIDER_UNAVAILABLE' });

    let claimed: { code: string; items?: unknown[] };
    try {
      claimed = await gateway.claim(secret, batch);
    } catch {
      return reply(503, { code: 'UNAVAILABLE' });
    }
    if (claimed.code !== 'OK' || !Array.isArray(claimed.items)) return reply(401, { code: 'AUTH_REQUIRED' });

    const results: DeliveryResult[] = [];
    for (const raw of claimed.items) {
      if (!isItem(raw)) {
        const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : null;
        if (id) results.push({ id, outcome: 'failed', error_code: 'INVALID_ITEM' });
        continue;
      }
      results.push(await deliver(provider, raw, options.appUrl, timeoutMs));
    }
    if (results.length > 0) {
      try {
        await gateway.report(secret, results);
      } catch {
        return reply(503, { code: 'UNAVAILABLE' });
      }
    }
    const count = (outcome: DeliveryResult['outcome']) => results.filter((r) => r.outcome === outcome).length;
    return reply(200, { sent: count('sent'), retry: count('retry'), failed: count('failed') });
  };
}
