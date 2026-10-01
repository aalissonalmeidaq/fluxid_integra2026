import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';
import { TELAS } from '../support/telas';

// CA-008: linha de base visual das telas em 360, 768 e 1920 px e nos estados principais. Só Chromium, e as capturas de
// referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a renderização da fonte difere por
// sistema. Veja specs/003-design-system-telas/quickstart.md para atualizar as capturas.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const LARGURAS = [
  { nome: '360', largura: 360, altura: 640 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

// Em estados com requisição pendente de propósito (carregando), a rede nunca fica ociosa.
async function capturar(page: Page, nome: string, aguardarRede = true): Promise<void> {
  // Tira o foco do último controle usado, para o anel de foco não variar entre execuções.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  if (aguardarRede) await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot(`${nome}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

const slug = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function entrarComoAdministrador(page: Page, backend: MockBackend, aal: 'aal1' | 'aal2'): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus(aal);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

for (const { nome: larguraNome, largura, altura } of LARGURAS) {
  test.describe(`${larguraNome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    for (const tela of TELAS) {
      test(`${tela.nome}: principal`, async ({ page }) => {
        await tela.abrir(page);
        await capturar(page, `${slug(tela.nome)}-principal-${larguraNome}`);
      });
    }

    test('entrada: erro (credencial inválida)', async ({ page }) => {
      const backend = new MockBackend();
      backend.loginResponses = [{ status: 401, body: { code: 'INVALID_CREDENTIALS' } }];
      await backend.install(page);
      await page.goto('/');
      await page.getByLabel('E-mail').fill('ana@e2e.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Forte-1');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await capturar(page, `entrada-erro-${larguraNome}`);
    });

    test('auditoria do tenant: erro (acesso negado)', async ({ page }) => {
      const backend = new MockBackend();
      backend.auditDenied = true;
      await entrarComoAdministrador(page, backend, 'aal2');
      await page.goto('/admin/auditoria');
      await expect(page.getByRole('alert')).toBeVisible();
      await capturar(page, `auditoria-erro-${larguraNome}`);
    });

    test('auditoria do tenant: vazio', async ({ page }) => {
      const backend = new MockBackend();
      backend.auditEvents = [];
      await entrarComoAdministrador(page, backend, 'aal2');
      await page.goto('/admin/auditoria');
      await expect(page.getByRole('heading', { name: /nenhum evento encontrado/i })).toBeVisible();
      await capturar(page, `auditoria-vazio-${larguraNome}`);
    });

    test('perfil: carregando', async ({ page }) => {
      const backend = new MockBackend();
      await entrarComoAdministrador(page, backend, 'aal1');
      backend.delayByPath['/rest/v1/profiles'] = 30_000;
      await page.goto('/perfil');
      await expect(page.getByRole('status').filter({ hasText: /carregando perfil/i })).toBeVisible();
      await capturar(page, `perfil-carregando-${larguraNome}`, false);
    });

    test('entrada: offline', async ({ page, context }) => {
      await new MockBackend().install(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible();
      await context.setOffline(true);
      await expect(page.getByText(/modo offline em operação/i)).toBeVisible();
      await capturar(page, `entrada-offline-${larguraNome}`);
    });
  });
}
