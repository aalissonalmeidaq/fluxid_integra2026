import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';

// CA-008 da Spec 005: linha de base visual da Visão geral em 360, 768 e 1920 px. Só Chromium, e as capturas de referência são
// geradas no Linux (contêiner oficial do Playwright ou CI), porque a renderização da fonte difere por sistema. Veja
// specs/003-design-system-telas/quickstart.md para atualizar as capturas.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

async function entrar(page: Page): Promise<void> {
  const backend = new MockBackend();
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`visão geral em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('principal', async ({ page }) => {
      await entrar(page);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('region', { name: 'Desempenho operacional' })).toContainText('Alertas tratados');
      // Tira o foco do último controle usado, para o anel de foco não variar entre execuções.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect(page).toHaveScreenshot(`visao-geral-principal-${nome}.png`, { fullPage: true, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
    });
  });
}
