import { test, expect } from '@playwright/test';

test.describe('App Shell Responsiveness and Performance (US4)', () => {
  test('shell carrega dentro do orçamento de 2000 ms e sem rolagem horizontal', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');

    const heading = page.getByRole('heading', { level: 1, name: 'FluxID' });
    await expect(heading).toBeVisible();

    const duration = Date.now() - startTime;
    expect(duration, `O shell levou ${duration} ms para exibir o título FluxID.`).toBeLessThanOrEqual(2000);

    // Valida ausência de rolagem horizontal indevida
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Valida região principal operável
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });
});
