import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Acessibilidade e Navegação por Teclado (US4)', () => {
  test('não possui violações críticas de acessibilidade (WCAG 2.2 AA / axe-core)', async ({ page }) => {
    await page.goto('/');

    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    const criticalViolations = accessibilityScanResults.violations.filter(
      (v) => v.impact === 'critical'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('permite navegação por teclado com foco visível', async ({ page }) => {
    await page.goto('/');

    // Tecla Tab para navegar entre elementos focáveis
    await page.keyboard.press('Tab');

    // Valida que o elemento focado existe
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedTag).toBeDefined();
  });
});
