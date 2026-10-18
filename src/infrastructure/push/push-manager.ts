// Inscrição de notificações no navegador (Spec 012, RF-036b; research.md item 8): o PushManager do service worker do PWA, com a chave
// VAPID PÚBLICA. Nada é guardado fora do navegador; o endereço e as chaves vão só para o FluxID, que decide quem recebe.

export type PushSupport = 'supported' | 'unsupported' | 'install_required';
export interface BrowserSubscription { endpoint: string; p256dh: string; auth: string }

export interface BrowserPush {
  support(): PushSupport;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  current(): Promise<BrowserSubscription | null>;
  subscribe(vapidPublicKey: string): Promise<BrowserSubscription>;
  unsubscribe(): Promise<void>;
  // Rótulo do aparelho para a pessoa reconhecer a inscrição ("Chrome no Android").
  label(): string;
}

const toBase64Url = (buffer: ArrayBuffer | null): string =>
  buffer ? btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '';
const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

const toBrowserSubscription = (subscription: PushSubscription): BrowserSubscription => ({
  endpoint: subscription.endpoint, p256dh: toBase64Url(subscription.getKey('p256dh')), auth: toBase64Url(subscription.getKey('auth')),
});

export function describeDevice(userAgent: string): string {
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : 'Navegador';
  const system = /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iPhone' : /Windows/.test(userAgent) ? 'Windows' : /Mac OS X/.test(userAgent) ? 'Mac' : /Linux/.test(userAgent) ? 'Linux' : 'aparelho';
  return `${browser} no ${system}`;
}

export function createBrowserPush(win: Window = window): BrowserPush {
  const nav = win.navigator;
  const registration = () => nav.serviceWorker.ready;
  return {
    support() {
      const ios = /iPhone|iPad/.test(nav.userAgent);
      const standalone = win.matchMedia?.('(display-mode: standalone)').matches || (nav as Navigator & { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in nav) || !('PushManager' in win) || !('Notification' in win)) return ios && !standalone ? 'install_required' : 'unsupported';
      return 'supported';
    },
    permission: () => (win as Window & typeof globalThis).Notification.permission,
    requestPermission: () => (win as Window & typeof globalThis).Notification.requestPermission(),
    async current() {
      const subscription = await (await registration()).pushManager.getSubscription();
      return subscription ? toBrowserSubscription(subscription) : null;
    },
    async subscribe(vapidPublicKey) {
      const subscription = await (await registration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(vapidPublicKey) });
      return toBrowserSubscription(subscription);
    },
    async unsubscribe() {
      const subscription = await (await registration()).pushManager.getSubscription();
      await subscription?.unsubscribe();
    },
    label: () => describeDevice(nav.userAgent),
  };
}
