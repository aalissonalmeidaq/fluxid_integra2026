// Notificações deste aparelho (Spec 012, RF-036b). Ativar é uma ação explícita: a permissão do navegador só é pedida depois do clique.
// A inscrição fica no navegador; o FluxID guarda só o endereço e as chaves públicas para enviar, e confere a permissão a cada envio.
import type { BrowserPush } from '@/infrastructure/push/push-manager';
import type { SealService } from './seal-service';

export type PushState = { state: 'unsupported' } | { state: 'install_required' } | { state: 'denied' } | { state: 'off' } | { state: 'on' } | { state: 'error' };

export class PushSubscriptions {
  private readonly browser: BrowserPush;
  private readonly service: SealService;
  private readonly organizationId: string;
  private readonly vapidPublicKey: string;

  constructor(browser: BrowserPush, service: SealService, organizationId: string, vapidPublicKey: string) {
    this.browser = browser;
    this.service = service;
    this.organizationId = organizationId;
    this.vapidPublicKey = vapidPublicKey;
  }

  async status(): Promise<PushState> {
    const support = this.browser.support();
    if (support !== 'supported') return { state: support };
    if (this.browser.permission() === 'denied') return { state: 'denied' };
    const current = await this.browser.current().catch(() => null);
    if (!current || this.browser.permission() !== 'granted') return { state: 'off' };
    const outcome = await this.service.pushStatus(this.organizationId, current.endpoint);
    return outcome.kind === 'success' && outcome.value ? { state: 'on' } : { state: 'off' };
  }

  async enable(): Promise<PushState> {
    const support = this.browser.support();
    if (support !== 'supported') return { state: support };
    const permission = this.browser.permission() === 'granted' ? 'granted' : await this.browser.requestPermission();
    if (permission !== 'granted') return { state: 'denied' };
    try {
      const subscription = await this.browser.subscribe(this.vapidPublicKey);
      const outcome = await this.service.pushSubscribe(this.organizationId, { ...subscription, label: this.browser.label() });
      if (outcome.kind === 'success') return { state: 'on' };
      await this.browser.unsubscribe().catch(() => undefined);
      return { state: 'error' };
    } catch {
      return { state: 'error' };
    }
  }

  async disable(): Promise<PushState> {
    const current = await this.browser.current().catch(() => null);
    if (current) await this.service.pushUnsubscribe(this.organizationId, current.endpoint);
    await this.browser.unsubscribe().catch(() => undefined);
    return { state: 'off' };
  }
}

