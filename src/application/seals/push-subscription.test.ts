import { describe, expect, it, vi } from 'vitest';
import type { BrowserPush } from '@/infrastructure/push/push-manager';
import { PushSubscriptions } from './push-subscription';
import { SealService, type SealTransport } from './seal-service';

// Spec 012 (T054; RF-036b): ativar pede a permissão do navegador só depois do clique; negada, explica como ativar; sem suporte (iPhone
// fora da tela de início), explica a instalação; desativar revoga no servidor. Nada fica guardado fora do navegador.
const SUB = { endpoint: 'https://push.example.invalid/a1', p256dh: 'p', auth: 'a' };

function browser(overrides: Partial<BrowserPush> = {}): BrowserPush & Record<string, ReturnType<typeof vi.fn>> {
  return {
    support: vi.fn(() => 'supported' as const),
    permission: vi.fn(() => 'default' as NotificationPermission),
    requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
    current: vi.fn(async () => null),
    subscribe: vi.fn(async () => SUB),
    unsubscribe: vi.fn(async () => undefined),
    label: vi.fn(() => 'Chrome no Android'),
    ...overrides,
  } as never;
}
const service = (bodies: Record<string, unknown>) => {
  const call = vi.fn(async (_fn: string, body: Record<string, unknown>) => ({ status: 200, body: bodies[String(body.operation)] ?? { code: 'OK' } }));
  return { service: new SealService({ call } as SealTransport), call };
};

describe('PushSubscriptions', () => {
  it('sem suporte, ou no iPhone fora da tela de início, explica o que fazer', async () => {
    const { service: s } = service({});
    expect(await new PushSubscriptions(browser({ support: vi.fn(() => 'unsupported' as const) }), s, 'org', 'vapid').status()).toEqual({ state: 'unsupported' });
    expect(await new PushSubscriptions(browser({ support: vi.fn(() => 'install_required' as const) }), s, 'org', 'vapid').status()).toEqual({ state: 'install_required' });
  });

  it('o estado vem do navegador e do servidor: desligado, ligado ou permissão negada', async () => {
    const { service: s } = service({ push_status: { code: 'FOUND', active: true } });
    expect(await new PushSubscriptions(browser(), s, 'org', 'vapid').status()).toEqual({ state: 'off' });
    expect(await new PushSubscriptions(browser({ current: vi.fn(async () => SUB), permission: vi.fn(() => 'granted' as NotificationPermission) }), s, 'org', 'vapid').status())
      .toEqual({ state: 'on' });
    expect(await new PushSubscriptions(browser({ permission: vi.fn(() => 'denied' as NotificationPermission) }), s, 'org', 'vapid').status()).toEqual({ state: 'denied' });
  });

  it('ativar: pede a permissão, inscreve no navegador e registra no servidor', async () => {
    const b = browser();
    const { service: s, call } = service({ push_subscribe: { code: 'SUBSCRIBED', subscription_id: 'x' } });
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(await new PushSubscriptions(b, s, 'org', 'vapid-publica').enable()).toEqual({ state: 'on' });
    expect(b.requestPermission).toHaveBeenCalledTimes(1);
    expect(b.subscribe).toHaveBeenCalledWith('vapid-publica');
    expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({
      operation: 'push_subscribe', organization_id: 'org', endpoint: SUB.endpoint, p256dh: 'p', auth: 'a', label: 'Chrome no Android', request_id: expect.any(String),
    }));
  });

  it('permissão negada no pedido: não inscreve', async () => {
    const b = browser({ requestPermission: vi.fn(async () => 'denied' as NotificationPermission) });
    const { service: s, call } = service({});
    expect(await new PushSubscriptions(b, s, 'org', 'vapid').enable()).toEqual({ state: 'denied' });
    expect(b.subscribe).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
  });

  it('servidor recusou: desfaz a inscrição do navegador', async () => {
    const b = browser();
    const { service: s } = service({ push_subscribe: { code: 'ACCESS_DENIED' } });
    expect((await new PushSubscriptions(b, s, 'org', 'vapid').enable()).state).toBe('error');
    expect(b.unsubscribe).toHaveBeenCalled();
  });

  it('desativar: revoga no servidor e no navegador', async () => {
    const b = browser({ current: vi.fn(async () => SUB) });
    const { service: s, call } = service({ push_unsubscribe: { code: 'UNSUBSCRIBED' } });
    expect(await new PushSubscriptions(b, s, 'org', 'vapid').disable()).toEqual({ state: 'off' });
    expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'push_unsubscribe', endpoint: SUB.endpoint }));
    expect(b.unsubscribe).toHaveBeenCalled();
  });
});
