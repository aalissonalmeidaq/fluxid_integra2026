// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSealGatewayHandler, type SealIngestGateway } from '../../supabase/functions/seal-gateway/handler';

// Spec 012 (T035): a borda do lacre (contracts/mensagens-do-lacre.md; RF-002, RF-006, CA-006). O banco é falso: as regras de verdade
// estão nas suítes pgTAP 012_device_auth, 012_rate_limit e 012_ingest_*.
const fixture = (nome: string) => readFileSync(path.resolve(import.meta.dirname, '../fixtures/seal-protocol', nome), 'utf8');
const KEY = 'fxk_chave-de-teste-da-suite';
const sha256 = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');

function gateway(result: unknown = { status: 200, body: JSON.parse(fixture('resposta-200-sem-comando.json')) }) {
  const ingest = vi.fn(async () => result);
  return { gateway: { ingest } as SealIngestGateway & { ingest: typeof ingest }, ingest };
}
const request = (init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new Request('http://x/functions/v1/seal-gateway', {
  method: init.method ?? 'POST',
  headers: { 'content-type': 'application/json', 'x-device-id': 'DSP-7KQ2M9XT', 'x-device-key': KEY, 'x-forwarded-for': '203.0.113.7, 10.0.0.1', ...init.headers },
  body: init.method === 'GET' ? undefined : init.body ?? fixture('pedido-position.json'),
});

const logs: ReturnType<typeof vi.spyOn>[] = [];
afterEach(() => { logs.splice(0).forEach((spy) => spy.mockRestore()); });

describe('seal-gateway', () => {
  it('só POST', async () => {
    const { gateway: g, ingest } = gateway();
    expect((await createSealGatewayHandler(g, 'sal')(request({ method: 'GET' }))).status).toBe(405);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('pedido válido: chama o banco com o hash da chave e do endereço, e responde o corpo do banco', async () => {
    const { gateway: g, ingest } = gateway();
    const response = await createSealGatewayHandler(g, 'sal')(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(JSON.parse(fixture('resposta-200-sem-comando.json')));
    const [code, keyHash, sourceHash, body] = ingest.mock.calls[0] as unknown as [string, string, string, { messages: { problem: unknown }[] }];
    expect(code).toBe('DSP-7KQ2M9XT');
    expect(keyHash).toBe(await sha256(KEY));
    expect(sourceHash).toBe(await sha256('sal:203.0.113.7'));
    expect(body.messages[0]!.problem).toBeNull();
    expect(JSON.stringify(ingest.mock.calls)).not.toContain(KEY);
  });

  it('sem chave: o banco recebe hash nulo e responde o mesmo 401 (conta a falha do endereço)', async () => {
    const { gateway: g, ingest } = gateway({ status: 401, body: { error: 'unauthorized' } });
    const response = await createSealGatewayHandler(g, 'sal')(request({ headers: { 'x-device-key': '' } }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect((ingest.mock.calls[0] as unknown[])[1]).toBeNull();
  });

  it('sem código do dispositivo: o mesmo 401, sem chamar o banco', async () => {
    const { gateway: g, ingest } = gateway();
    const response = await createSealGatewayHandler(g, 'sal')(request({ headers: { 'x-device-id': '' } }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('limite: 429 com Retry-After', async () => {
    const { gateway: g } = gateway({ status: 429, retry_after: 42, body: { error: 'rate_limited' } });
    const response = await createSealGatewayHandler(g, 'sal')(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('42');
    expect(await response.json()).toEqual({ error: 'rate_limited' });
  });

  // Spec 013 (contracts/pedido-de-aprovacao.md): a borda repassa o pedido de aprovação como o banco responde, sem acrescentar nada.
  it.each([
    ['aguardando', 202, 'enrollment-pending-approval-202.json'],
    ['devolvido', 202, 'enrollment-returned-202.json'],
    ['retirado', 202, 'enrollment-withdrawn-202.json'],
    ['recusado', 403, 'enrollment-refused-403.json'],
  ])('pedido %s: repassa %i com o corpo do banco', async (_caso, status, nome) => {
    const body = JSON.parse(fixture(nome)) as Record<string, unknown>;
    const { gateway: g } = gateway({ status, body });
    const response = await createSealGatewayHandler(g, 'sal')(request({ body: fixture('enrollment-pending-request.json') }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.get('retry-after')).toBeNull();
  });

  it('pedido novo acima do limite do endereço: 429 com Retry-After', async () => {
    const { gateway: g } = gateway({ status: 429, retry_after: 1800, body: { error: 'rate_limited' } });
    const response = await createSealGatewayHandler(g, 'sal')(request({ body: fixture('enrollment-pending-request.json') }));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('1800');
    expect(await response.json()).toEqual({ error: 'rate_limited' });
  });

  it('conflito de chave: o mesmo 401 sem motivo, mesmo que o banco mande mais campos', async () => {
    const { gateway: g } = gateway({ status: 401, body: { error: 'unauthorized', reason: 'conflict' } });
    const response = await createSealGatewayHandler(g, 'sal')(request({ body: fixture('enrollment-pending-request.json') }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('corpo fora do formato: 400 sem chamar o banco', async () => {
    for (const body of ['não é json', '{"protocol":1}', '{"protocol":2,"messages":[{"message_id":"a","type":"position"}]}', 'x'.repeat(70_000)]) {
      const { gateway: g, ingest } = gateway();
      const response = await createSealGatewayHandler(g, 'sal')(request({ body }));
      expect(response.status).toBe(400);
      expect(['invalid_body', 'unsupported_protocol']).toContain(((await response.json()) as { error: string }).error);
      expect(ingest).not.toHaveBeenCalled();
    }
  });

  it('falha do banco: 503 para o lacre reenviar', async () => {
    const g: SealIngestGateway = { ingest: vi.fn(async () => { throw new Error('rpc'); }) };
    const response = await createSealGatewayHandler(g, 'sal')(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'unavailable' });
  });

  it('nunca registra corpo, cabeçalho nem resposta', async () => {
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) logs.push(vi.spyOn(console, level).mockImplementation(() => undefined));
    const { gateway: g } = gateway();
    await createSealGatewayHandler(g, 'sal')(request());
    await createSealGatewayHandler({ ingest: vi.fn(async () => { throw new Error(KEY); }) }, 'sal')(request());
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
  });
});
