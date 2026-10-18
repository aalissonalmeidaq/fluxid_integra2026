// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSealPushHandler, type PushGateway, type PushItem, type PushSender } from '../../supabase/functions/seal-push/handler';

// Spec 012 (T053; RF-036a a RF-036d, CA-010): a função de envio só age com o segredo do Vault, envia o lote, revoga a inscrição que o
// serviço de push dá como inexistente (404/410) e nunca registra nada. O texto vem pronto do banco, sem coordenada nem cliente.
const ITEM: PushItem = { id: 'o1', endpoint: 'https://push.example.invalid/a1', p256dh: 'p', auth: 'a', title: 'FluxID — possível extravio', body: 'Cilindro S-1 · 17/10 14:03', url: '/alertas/x' };

function gateway(items: PushItem[] | 'denied' = [ITEM]) {
  const claim = vi.fn(async () => (items === 'denied' ? { code: 'ACCESS_DENIED' } : { code: 'OK', items }));
  const report = vi.fn(async () => ({ code: 'OK' }));
  return { gateway: { claim, report } as PushGateway, claim, report };
}
const request = (secret: string | null = 'segredo', method = 'POST') => new Request('http://x/functions/v1/seal-push', {
  method, headers: secret === null ? {} : { 'x-seal-push-secret': secret },
});

const spies: ReturnType<typeof vi.spyOn>[] = [];
afterEach(() => { spies.splice(0).forEach((s) => s.mockRestore()); });

describe('seal-push', () => {
  it('sem o segredo: 401 sem consultar o banco', async () => {
    const g = gateway();
    const sender: PushSender = { send: vi.fn() };
    expect((await createSealPushHandler(g.gateway, sender)(request(null))).status).toBe(401);
    expect(g.claim).not.toHaveBeenCalled();
    expect((await createSealPushHandler(g.gateway, sender)(request('x', 'GET'))).status).toBe(405);
  });

  it('segredo errado: o banco recusa e nada é enviado', async () => {
    const g = gateway('denied');
    const sender: PushSender = { send: vi.fn() };
    expect((await createSealPushHandler(g.gateway, sender)(request('errado'))).status).toBe(401);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('envia o lote e informa o resultado de cada item', async () => {
    const second = { ...ITEM, id: 'o2', endpoint: 'https://push.example.invalid/gone' };
    const third = { ...ITEM, id: 'o3', endpoint: 'https://push.example.invalid/erro' };
    const g = gateway([ITEM, second, third]);
    const sender: PushSender = { send: vi.fn(async (item: PushItem) => (item.id === 'o1' ? 'sent' : item.id === 'o2' ? 'gone' : { failed: 'http_500' })) };
    const response = await createSealPushHandler(g.gateway, sender)(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, failed: 2 });
    expect(g.claim).toHaveBeenCalledWith('segredo', 50);
    expect(g.report).toHaveBeenCalledWith('segredo', [
      { id: 'o1', outcome: 'sent' }, { id: 'o2', outcome: 'gone' }, { id: 'o3', outcome: 'failed', error: 'http_500' },
    ]);
  });

  it('a mensagem enviada tem só título, texto e endereço do alerta', async () => {
    const g = gateway();
    const send = vi.fn(async () => 'sent' as const);
    await createSealPushHandler(g.gateway, { send })(request());
    expect(send).toHaveBeenCalledWith(ITEM);
    const payload = JSON.stringify((send.mock.calls[0] as unknown[])[0]);
    expect(payload).not.toMatch(/latitude|longitude|Hospital|cliente/i);
  });

  it('falha de envio vira "falhou" e o lote continua; nada é registrado no console', async () => {
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) spies.push(vi.spyOn(console, level).mockImplementation(() => undefined));
    const g = gateway([ITEM, { ...ITEM, id: 'o2' }]);
    const send = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('sent');
    const response = await createSealPushHandler(g.gateway, { send })(request());
    expect(await response.json()).toEqual({ sent: 1, failed: 1 });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
