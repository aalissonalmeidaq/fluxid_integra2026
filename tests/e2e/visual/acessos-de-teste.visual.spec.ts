import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';

// Spec 014 (T015): linha de base visual do modal "Acessos de teste" em 360, 768 e 1920 px. Só Chromium, com as capturas de
// referência geradas no Linux (npm run test:visual:atualizar). O modal é capturado na janela, como os demais diálogos.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

async function abrirModal(page: Page): Promise<void> {
  await new MockBackend().install(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
  await page.getByRole('button', { name: 'Acessos de teste' }).click();
  await expect(page.getByRole('dialog', { name: 'Acessos de teste' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`acessos de teste em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('modal aberto', async ({ page }) => {
      await abrirModal(page);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect(page).toHaveScreenshot(`acessos-de-teste-${nome}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
    });
  });
}
