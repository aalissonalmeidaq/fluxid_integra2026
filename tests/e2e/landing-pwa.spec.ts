import { test, expect } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

// Spec 011, US6 (T051; RNF-008): o PWA continua instalável e funcionando. O manifesto inicia em /visao-geral; o aplicativo instalado
// (display-mode: standalone) nunca abre a landing; no navegador comum "/" é a landing; e a landing abre sem conexão, com o aviso de
// "precisa de conexão" nos links externos.
test.describe('Landing e PWA (Spec 011, US6)', () => {
  test.use({ serviceWorkers: 'block' });

  test('o manifesto inicia o aplicativo instalado na Visão geral', async ({ request }) => {
    const manifesto = (await (await request.get('/manifest.webmanifest')).json()) as { start_url: string; display: string };
    expect(manifesto.start_url).toBe('/visao-geral');
    expect(manifesto.display).toBe('standalone');
  });

  test('no navegador comum "/" mostra a landing', async ({ page }) => {
    await new MockBackend().install(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Saiba onde está cada cilindro/ })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('em modo instalado, abrir "/" leva ao sistema sem passar pela landing', async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (consulta: string): MediaQueryList => {
        const lista = original(consulta);
        if (!consulta.includes('display-mode: standalone')) return lista;
        // "matches" é só leitura no protótipo: a propriedade própria precisa ser definida, não atribuída.
        return Object.defineProperty(Object.create(lista) as MediaQueryList, 'matches', { value: true });
      };
    });
    await new MockBackend().install(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/visao-geral$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Saiba onde está cada cilindro/ })).toHaveCount(0);
  });
});

test.describe('Landing offline com o service worker (Spec 011, US6)', () => {
  test.use({ serviceWorkers: 'allow' });

  test('abre a landing sem rede, e os links externos avisam que precisam de conexão', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Saiba onde está cada cilindro/ })).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: /Saiba onde está cada cilindro/ })).toBeVisible();
      // 5 links externos nos materiais e o botão de cada um dos 3 vídeos (no pitch, na trava e no que já funciona).
      await expect(page.getByText('Precisa de conexão')).toHaveCount(8);
    } finally {
      await context.setOffline(false);
    }
    await expect(page.getByText('Precisa de conexão')).toHaveCount(0);
  });
});
