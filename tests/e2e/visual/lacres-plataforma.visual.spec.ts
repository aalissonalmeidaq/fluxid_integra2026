import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';
import { ORG_A } from '../support/mock-registry';
import { novoPedido } from '../support/mock-seals-plataforma';

// Linha de base visual da tela "Lacres da plataforma" (Spec 013, T063) em 360, 768 e 1920 px: a fila em Aguardando (com conflito e com
// redes de outro tenant), o diálogo de aprovação e o bloco da rede de configuração com a senha revelada. Só Chromium, com as capturas
// de referência geradas no Linux (npm run test:visual:atualizar). Nunca versione `*-win32.png`.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

// No passado: o token do backend simulado vale uma hora a partir do relógio real, e um relógio fixo no futuro o veria vencido.
// No passado: o token do backend simulado vale uma hora a partir do relógio real; fixo no futuro, a página o veria vencido.
const AGORA = new Date('2026-10-18T12:00:00.000Z');
const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

async function entrarComoMaster(page: Page): Promise<void> {
  await page.clock.setFixedTime(AGORA);
  const backend = new MockBackend().asProfile('master');
  backend.seals.now = () => AGORA;
  novoPedido(backend.seals, { device_code: 'DSP-7KQ2M9XT', calls: 4, signal_dbm: -58 });
  novoPedido(backend.seals, { device_code: 'DSP-8HJ3N4PW', conflict: true, calls: 2, signal_dbm: -71 });
  novoPedido(backend.seals, { device_code: 'DSP-9ABCDEFG', calls: 12, signal_dbm: -82, last_organization: { id: ORG_A, name: 'Tenant A' } });
  backend.platformSeals.portalPassword = 'senha-ficticia-do-portal';
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/visao-geral');
  await page.getByLabel('E-mail').fill('master@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-001!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
  await page.goto('/admin/lacres');
  await expect(page.getByRole('row', { name: /DSP-7KQ2M9XT/ })).toBeVisible();
}

async function capturar(page: Page, nome: string, paginaInteira = true): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page).toHaveScreenshot(nome, { fullPage: paginaInteira, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`lacres da plataforma em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('fila em Aguardando', async ({ page }) => {
      await entrarComoMaster(page);
      await capturar(page, `lacres-plataforma-fila-${nome}.png`);
    });

    test('diálogo de aprovação', async ({ page }) => {
      await entrarComoMaster(page);
      await page.getByRole('row', { name: /DSP-7KQ2M9XT/ }).getByRole('button', { name: /^Aprovar/ }).click();
      const dialogo = page.getByRole('dialog', { name: 'Aprovar o lacre DSP-7KQ2M9XT' });
      await expect(dialogo.getByRole('option', { name: 'Tenant A' })).toBeAttached();
      await dialogo.getByLabel('Tenant de destino').selectOption({ label: 'Tenant A' });
      await capturar(page, `lacres-plataforma-aprovar-${nome}.png`, false);
    });

    test('rede de configuração com a senha revelada', async ({ page }) => {
      await entrarComoMaster(page);
      const bloco = page.getByRole('region', { name: 'Rede de configuração' });
      await bloco.getByRole('button', { name: 'Mostrar a senha' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Mostrar a senha da rede de configuração' });
      await dialogo.getByLabel('Justificativa').fill('Instalação no depósito');
      await dialogo.getByRole('button', { name: 'Mostrar a senha' }).click();
      await expect(bloco.getByLabel('Senha da rede de configuração', { exact: true })).toHaveValue('senha-ficticia-do-portal');
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect(bloco).toHaveScreenshot(`lacres-plataforma-rede-${nome}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
    });
  });
}
