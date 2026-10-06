import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';

// CA-009 da Spec 006: linha de base visual das telas de cilindros em 360, 768 e 1920 px. Só Chromium, e as capturas de referência
// são geradas no Linux (contêiner oficial do Playwright ou CI), porque a renderização da fonte difere por sistema. Veja
// specs/003-design-system-telas/quickstart.md para atualizar as capturas.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

async function entrar(page: Page): Promise<void> {
  const backend = new MockBackend().asProfile('cilindros-admin');
  backend.cylinders.now = () => new Date('2026-10-05T13:30:00.000Z');
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
}

async function capturar(page: Page, nome: string): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Tira o foco do último controle usado, para o anel de foco não variar entre execuções.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page).toHaveScreenshot(nome, { fullPage: true, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`cilindros em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('lista', async ({ page }) => {
      await entrar(page);
      await page.goto('/cilindros');
      await expect(page.getByRole('link', { name: 'CIL-001' })).toBeVisible();
      await capturar(page, `cilindros-lista-${nome}.png`);
    });

    test('cadastro', async ({ page }) => {
      await entrar(page);
      await page.goto('/cilindros/novo');
      await expect(page.getByRole('heading', { level: 2, name: 'Cadastrar cilindro' })).toBeVisible();
      await capturar(page, `cilindros-cadastro-${nome}.png`);
    });

    test('detalhe', async ({ page }) => {
      await entrar(page);
      await page.goto('/cilindros/72000000-0000-4000-8000-000000000003');
      await expect(page.getByRole('heading', { level: 2, name: 'Cilindro CIL-003' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Histórico' }).getByRole('listitem').first()).toBeVisible();
      await capturar(page, `cilindros-detalhe-${nome}.png`);
    });

    test('entrada no estoque', async ({ page }) => {
      await entrar(page);
      await page.goto('/estoque/entrada');
      await expect(page.getByRole('heading', { level: 2, name: 'Entrada no estoque' })).toBeVisible();
      await capturar(page, `cilindros-entrada-${nome}.png`);
    });
  });
}
