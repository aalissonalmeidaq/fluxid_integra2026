import { test, expect } from '@playwright/test';

test.describe('PWA e Funcionamento Offline (US4)', () => {
  test('inclui link para o manifest e tags essenciais de PWA no HTML', async ({ page }) => {
    await page.goto('/');

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached();

    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#0f172a');
  });

  test('manifest webmanifest é acessível e contém metadados corretos', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const json = await response.json();
    expect(json.name).toBe('FluxID');
    expect(json.short_name).toBe('FluxID');
    expect(json.display).toBe('standalone');
  });
});
