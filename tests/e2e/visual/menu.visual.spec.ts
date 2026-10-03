import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';

// CA-008 da Spec 004: linha de base visual do menu de navegação em 360, 768 e 1920 px, nos estados pronto, carregando, erro e
// offline. Só Chromium, e as capturas de referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a
// renderização da fonte difere por sistema. Veja specs/003-design-system-telas/quickstart.md para atualizar as capturas.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

const PERMISSIONS_PATH = '/functions/v1/query-permissions';

async function entrar(page: Page, backend: MockBackend): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
}

async function abrirSeRecolhido(page: Page): Promise<void> {
  const botao = page.getByRole('button', { name: 'Menu' });
  if (await botao.isVisible()) await botao.click();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
}

// Tira o foco do último controle usado, para o anel de foco não variar entre execuções.
async function capturar(page: Page, nome: string, aguardarRede = true): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  if (aguardarRede) await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot(`${nome}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`menu em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('pronto, com o administrador do tenant', async ({ page }) => {
      await entrar(page, new MockBackend());
      await abrirSeRecolhido(page);
      await expect(page.getByRole('link', { name: 'Auditoria do tenant' })).toBeVisible();
      await capturar(page, `menu-pronto-${nome}`);
    });

    test('pronto, com o perfil global', async ({ page }) => {
      const backend = new MockBackend().asProfile('master');
      backend.tenantMemberships = [];
      await entrar(page, backend);
      await abrirSeRecolhido(page);
      await expect(page.getByRole('link', { name: 'Auditoria da plataforma' })).toBeVisible();
      await capturar(page, `menu-global-${nome}`);
    });

    test('carregando', async ({ page }) => {
      const backend = new MockBackend();
      backend.delayByPath[PERMISSIONS_PATH] = 60_000;
      await entrar(page, backend);
      await abrirSeRecolhido(page);
      await expect(page.getByRole('navigation').getByRole('status')).toContainText('Carregando telas…');
      await capturar(page, `menu-carregando-${nome}`, false);
    });

    test('erro', async ({ page }) => {
      const backend = new MockBackend();
      backend.permissionsStatus = 500;
      await entrar(page, backend);
      await abrirSeRecolhido(page);
      await expect(page.getByRole('navigation').getByRole('alert')).toBeVisible();
      await capturar(page, `menu-erro-${nome}`);
    });

    test('offline', async ({ page, context }) => {
      await entrar(page, new MockBackend());
      await abrirSeRecolhido(page);
      await expect(page.getByRole('link', { name: 'Auditoria do tenant' })).toBeVisible();
      await context.setOffline(true);
      await expect(page.getByRole('navigation').getByRole('status')).toContainText('Sem conexão. As telas podem estar desatualizadas.');
      await capturar(page, `menu-offline-${nome}`, false);
    });
  });
}
