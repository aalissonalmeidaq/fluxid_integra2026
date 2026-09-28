import { test, expect } from '@playwright/test';

test.describe('PWA e Funcionamento Offline (US4)', () => {
  test('inclui link para o manifest e tags essenciais de PWA no HTML', async ({ page }) => {
    await page.goto('/');

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached();

    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#1249BB');
  });

  test('manifest webmanifest é acessível e contém metadados corretos', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const json = await response.json();
    expect(json.name).toBe('FluxID');
    expect(json.short_name).toBe('FluxID');
    expect(json.display).toBe('standalone');
  });

  test('registra, ativa, controla a página e carrega o app shell', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();

    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const serviceWorker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return Boolean(registration.active);
    });
    expect(serviceWorker).toBe(true);

    await expect(page.getByRole('main')).toBeVisible();
  });

  test('abre o app shell sem rede quando a emulação offline é suportada', async ({ page, context, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.'
    );

    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'FluxID' })).toBeVisible();
      await expect(page.getByRole('main')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('mantém o shell previsível quando recurso remoto do Supabase falha', async ({ page }) => {
    await page.goto('/');
    await page.route('**/auth/v1/**', (route) => route.abort('failed'));

    const remoteResult = await page.evaluate(async () => {
      try {
        await fetch('/auth/v1/health');
        return 'resolved';
      } catch {
        return 'failed';
      }
    });

    expect(remoteResult).toBe('failed');
    await expect(page.getByRole('main')).toBeVisible();
  });
});
