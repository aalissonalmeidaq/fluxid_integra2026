import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

// Spec 005, US1: a entrada renovada, com backend simulado, em 360, 768 e 1920 px. O comportamento de autenticação é o da
// Spec 002; aqui se confere a moldura de marca, o campo de senha e as telas públicas.
test.use({ serviceWorkers: 'block' });

async function abrir(page: Page, backend = new MockBackend()): Promise<void> {
  await backend.install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
}

const preencher = async (page: Page, email = 'ana@e2e.invalid', senha = 'Senha-E2E-Forte-1') => {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
};

const semRolagemHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Entrada renovada (Spec 005, US1)', () => {
  test('painel de marca ao lado do formulário a partir de 1024 px e faixa no alto abaixo disso', async ({ page }) => {
    await abrir(page);
    const painel = await page.locator('aside').boundingBox();
    const formulario = await page.getByRole('region', { name: 'Bem-vindo de volta' }).boundingBox();
    expect(painel).not.toBeNull();
    expect(formulario).not.toBeNull();
    const largura = page.viewportSize()?.width ?? 0;
    if (largura >= 1024) {
      expect(painel!.x + painel!.width).toBeLessThanOrEqual(formulario!.x + 1);
    } else {
      expect(painel!.y + painel!.height).toBeLessThanOrEqual(formulario!.y + 1);
    }
    await expect(page.getByText('Cada cilindro, uma identidade.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('banner')).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('não oferece login social, "Lembrar de mim", cadastro público nem suporte', async ({ page }) => {
    await abrir(page);
    await expect(page.getByText(/google|microsoft|apple|lembrar de mim|criar conta|cadastre-se|suporte/i)).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });

  test('entrada válida leva à Visão geral', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    await abrir(page, backend);
    await preencher(page);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
    await expect(page.getByText('Cada cilindro, uma identidade.')).toHaveCount(0);
  });

  test('entrada inválida mostra mensagem genérica e devolve o foco à senha', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [{ status: 401, body: { code: 'INVALID_CREDENTIALS' } }];
    await abrir(page, backend);
    await preencher(page);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/e-mail ou senha incorretos/i);
    await expect(page.getByLabel('Senha', { exact: true })).toBeFocused();
  });

  test('perfil com segundo fator vê a verificação com a mesma moldura, um só h1 e sem menu', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated('MFA_REQUIRED')];
    backend.statusResponse = backend.activeStatus('aal2', false);
    await abrir(page, backend);
    await preencher(page, 'global@e2e.invalid', 'Senha-E2E-Global-1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();
    await expect(page.getByText('Cada cilindro, uma identidade.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('mostrar e ocultar a senha funciona só pelo teclado e mantém o valor', async ({ page }) => {
    await abrir(page);
    const senha = page.getByLabel('Senha', { exact: true });
    await senha.fill('Segredo-123');
    await expect(senha).toHaveAttribute('type', 'password');
    await page.keyboard.press('Tab');
    const botao = page.getByRole('button', { name: 'Mostrar senha' });
    await expect(botao).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(senha).toHaveAttribute('type', 'text');
    await expect(senha).toHaveValue('Segredo-123');
    await expect(page.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('aberta offline mostra o estado de conexão existente e o envio volta a funcionar ao reconectar', async ({ page, context }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    await abrir(page, backend);
    await context.setOffline(true);
    await expect(page.getByText(/modo offline em operação/i)).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText(/modo offline em operação/i)).toHaveCount(0);
    await preencher(page);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  });

  test('sem violação crítica ou grave no axe e sem rolagem horizontal de 320 a 1920 px e com zoom de 200%', async ({ page }) => {
    await abrir(page);
    const resultado = await new AxeBuilder({ page }).analyze();
    expect(resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious')).toEqual([]);
    for (const largura of [320, 360, 768, 1024, 1366, 1920]) {
      await page.setViewportSize({ width: largura, height: 800 });
      expect(await semRolagemHorizontal(page), `Rolagem horizontal em ${largura} px.`).toBe(true);
    }
    await page.setViewportSize({ width: 640, height: 800 });
    await page.addStyleTag({ content: 'body { zoom: 2; }' });
    expect(await semRolagemHorizontal(page), 'Rolagem horizontal com zoom de 200%.').toBe(true);
  });

  test('com movimento reduzido nada na entrada tem animação ou transição em curso', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await abrir(page);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  test('as telas de recuperação de senha usam a mesma moldura', async ({ page }) => {
    await new MockBackend().install(page);
    await page.goto('/?recovery=1');
    await expect(page.getByRole('heading', { level: 2, name: 'Recuperar acesso' })).toBeVisible();
    await expect(page.getByText('Cada cilindro, uma identidade.')).toBeVisible();
    await page.goto('/recuperar-senha/confirmar');
    await expect(page.getByRole('heading', { level: 2, name: 'Definir nova senha' })).toBeVisible();
    await expect(page.getByText('Cada cilindro, uma identidade.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
});
