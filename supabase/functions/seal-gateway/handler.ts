import { parseSealRequest } from '../_shared/seal-protocol.ts';

// Borda do lacre (Spec 012, contracts/mensagens-do-lacre.md). Fina de propósito: valida o formato, calcula o SHA-256 da chave e do
// endereço de origem e entrega tudo a UMA RPC transacional (`seal_ingest`), que autentica, limita, deduplica e responde. Nunca registra
// corpo, cabeçalho nem resposta: a chave do dispositivo passa por aqui (RF-040). Toda falha de autenticação tem a mesma resposta.
// Spec 013: o pedido de aprovação (202, 403) e o limite de pedidos novos (429) passam do banco ao lacre sem nada acrescentado.

export interface SealIngestGateway {
  // Devolve `{ status, body, retry_after? }` exatamente como `public.seal_ingest`.
  ingest(deviceCode: string, keyHashHex: string | null, sourceHashHex: string | null, body: unknown): Promise<unknown>;
}

const MAX_BODY_BYTES = 64 * 1024;
const DEVICE_CODE = /^DSP-[0-9A-Z]{8}$/;

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const UNAUTHORIZED = () => reply(401, { error: 'unauthorized' });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// `sourceSalt`: segredo da função; o endereço de origem só é guardado como hash com sal (sem dado pessoal, research.md item 3).
export function createSealGatewayHandler(gateway: SealIngestGateway, sourceSalt: string) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

    const deviceCode = (request.headers.get('x-device-id') ?? '').trim();
    if (!DEVICE_CODE.test(deviceCode)) return UNAUTHORIZED();
    const key = request.headers.get('x-device-key') ?? '';
    const forwarded = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? '';
    const source = forwarded || request.headers.get('cf-connecting-ip') || '';

    const text = await request.text().catch(() => '');
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return reply(400, { error: 'invalid_body' });
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return reply(400, { error: 'invalid_body' });
    }
    const parsed = parseSealRequest(raw);
    if (!parsed.ok) return reply(400, { error: parsed.error });

    let result: unknown;
    try {
      result = await gateway.ingest(deviceCode, key ? await sha256Hex(key) : null, source ? await sha256Hex(`${sourceSalt}:${source}`) : null, parsed.value);
    } catch {
      return reply(503, { error: 'unavailable' });
    }
    if (!isObject(result) || typeof result.status !== 'number' || !isObject(result.body)) return reply(503, { error: 'unavailable' });
    if (result.status === 401) return UNAUTHORIZED();
    const headers: Record<string, string> = {};
    if (result.status === 429 && typeof result.retry_after === 'number') headers['retry-after'] = String(result.retry_after);
    return reply(result.status, result.body, headers);
  };
}
