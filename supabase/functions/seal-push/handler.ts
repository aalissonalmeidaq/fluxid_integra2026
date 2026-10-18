// Envio das notificações push (Spec 012, RF-036a a RF-036d; research.md item 8). Chamada pelo banco (`pg_net`) com o segredo do Vault no
// cabeçalho; o próprio banco confere o segredo ao entregar o lote. O texto vem pronto do banco (tipo, cilindro e horário; nada de
// coordenada, cliente ou pessoa). Nunca registra nada: o endereço de cada aparelho passa por aqui.

export interface PushItem {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  url: string;
}

export interface PushGateway {
  claim(secret: string, limit: number): Promise<{ code: string; items?: PushItem[] }>;
  report(secret: string, results: { id: string; outcome: 'sent' | 'gone' | 'failed'; error?: string }[]): Promise<unknown>;
}

export interface PushSender {
  // `gone`: o serviço de push diz que a inscrição não existe mais (404/410); a inscrição é revogada.
  send(item: PushItem): Promise<'sent' | 'gone' | { failed: string }>;
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createSealPushHandler(gateway: PushGateway, sender: PushSender, batch = 50) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const secret = request.headers.get('x-seal-push-secret');
    if (!secret) return reply(401, { error: 'unauthorized' });
    let claimed: { code: string; items?: PushItem[] };
    try {
      claimed = await gateway.claim(secret, batch);
    } catch {
      return reply(503, { error: 'unavailable' });
    }
    if (claimed.code !== 'OK' || !Array.isArray(claimed.items)) return reply(401, { error: 'unauthorized' });

    const results: { id: string; outcome: 'sent' | 'gone' | 'failed'; error?: string }[] = [];
    for (const item of claimed.items) {
      try {
        const outcome = await sender.send(item);
        results.push(typeof outcome === 'string' ? { id: item.id, outcome } : { id: item.id, outcome: 'failed', error: outcome.failed });
      } catch {
        results.push({ id: item.id, outcome: 'failed', error: 'send_error' });
      }
    }
    if (results.length > 0) {
      try {
        await gateway.report(secret, results);
      } catch {
        return reply(503, { error: 'unavailable' });
      }
    }
    return reply(200, { sent: results.filter((r) => r.outcome === 'sent').length, failed: results.filter((r) => r.outcome !== 'sent').length });
  };
}
