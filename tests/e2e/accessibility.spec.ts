import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Acessibilidade e Navegação por Teclado (US4)', () => {
  test('não possui violações críticas ou graves de acessibilidade (WCAG 2.2 AA / axe-core)', async ({ page }) => {
    await page.goto('/');

    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    const blockingViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    const evidence = blockingViolations
      .map((violation) => `${violation.impact}: ${violation.id} em ${violation.nodes.map((node) => node.target.join(', ')).join('; ')}`)
      .join('\n');

    expect(blockingViolations, evidence || 'Nenhuma violação crítica ou grave encontrada.').toEqual([]);
  });

  test('permite navegação por teclado com foco visível e ordem lógica', async ({ page, browserName }) => {
    await page.goto('/');

    const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo principal' });
    const main = page.getByRole('main');

    if (browserName === 'webkit') {
      await skipLink.focus();
    } else {
      await page.keyboard.press('Tab');
    }
    await expect(skipLink).toBeFocused();

    const focusStyle = await skipLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    expect(focusStyle.outlineStyle !== 'none' || focusStyle.boxShadow !== 'none').toBe(true);

    await page.keyboard.press('Enter');
    await expect(main).toBeFocused();
  });

  test('permite acionamento por teclado de controles interativos e evita armadilhas de foco', async ({ page, browserName }) => {
    // Interrompe requisições para forçar o estado offline e exibir o controle de reconexão
    await page.route('**/auth/v1/**', (route) => route.abort('failed'));
    await page.goto('/');

    const reconnectBtn = page.getByRole('button', { name: /reconectar|tentar reconectar/i });
    await expect(reconnectBtn).toBeVisible({ timeout: 10000 });

    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    // Navega: Skip Link -> Botão Reconectar
    await page.keyboard.press(tabKey);
    await page.keyboard.press('Tab');

    await expect(reconnectBtn).toBeFocused();

    // Aciona controle pelo teclado
    await page.keyboard.press('Enter');

    // Valida ausência de armadilhas de foco recuando com Shift+Tab
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo principal' })).toBeFocused();
  });
});

