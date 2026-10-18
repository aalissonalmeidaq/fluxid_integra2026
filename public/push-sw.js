// Notificações push do FluxID (Spec 012, RF-036a a RF-036d). Importado pelo service worker gerado (vite.config.ts, workbox.importScripts).
// A mensagem traz só título, texto e o endereço do alerta, montados no servidor sem coordenada, cliente nem nome de pessoa (RF-036c).
// Ao tocar, abre o alerta no app: só caminhos do próprio FluxID em /alertas, nunca um endereço vindo de fora.
const ALERT_PATH = /^\/alertas(\/[0-9a-f-]{36})?$/i;

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const url = typeof data.url === 'string' && ALERT_PATH.test(data.url) ? data.url : '/alertas';
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' ? data.title : 'FluxID', {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: url,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data && ALERT_PATH.test(event.notification.data.url) ? event.notification.data.url : '/alertas';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        return client.navigate(target).then((navigated) => (navigated ?? client).focus());
      }
    }
    return self.clients.openWindow(target);
  }));
});
