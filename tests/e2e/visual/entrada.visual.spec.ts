import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';

// CA-008 da Spec 005: linha de base visual da entrada renovada em 360, 768 e 1920 px, nos estados principal, erro e offline.
// Só Chromium, e as capturas de referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a renderização
// da fonte difere por sistema. Veja specs/003-design-system-telas/quickstart.md para atualizar as capturas.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

async function abrir(page: Page, backend = new MockBackend()): Promise<void> {
  await backend.install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
}

// Tira o foco do último controle usado, para o anel de foco não variar entre execuções.
async function capturar(page: Page, nome: string): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page).toHaveScreenshot(`${nome}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`entrada em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('principal', async ({ page }) => {
      await abrir(page);
      await page.waitForLoadState('networkidle');
      await capturar(page, `entrada-principal-${nome}`);
    });

    test('erro de credencial', async ({ page }) => {
      const backend = new MockBackend();
      backend.loginResponses = [{ status: 401, body: { code: 'INVALID_CREDENTIALS' } }];
      await abrir(page, backend);
      await page.getByLabel('E-mail').fill('ana@e2e.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Forte-1');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText(/e-mail ou senha incorretos/i);
      await page.waitForLoadState('networkidle');
      await capturar(page, `entrada-erro-${nome}`);
    });

    test('offline', async ({ page, context }) => {
      await abrir(page);
      await page.waitForLoadState('networkidle');
      await context.setOffline(true);
      await expect(page.getByText(/modo offline em operação/i)).toBeVisible();
      await capturar(page, `entrada-offline-${nome}`);
    });
  });
}
