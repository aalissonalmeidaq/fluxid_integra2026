import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

// Spec 014, US1 (RF-006 a RF-010, MS-001): o botão "Acessos de teste" e o modal na tela de login, com backend simulado, em 360, 768 e
// 1920 px e no WebKit. O preenchimento não envia nada; a entrada só acontece quando a pessoa aciona Entrar.
test.use({ serviceWorkers: 'block' });

async function abrir(page: Page, backend = new MockBackend()): Promise<void> {
  await backend.install(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
}

const semRolagemHorizontal = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Acessos de teste (Spec 014, US1)', () => {
  test('só com o teclado: abre o modal, o foco fica preso, escolhe o administrador e entra', async ({ page }) => {
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus();
    const envios: unknown[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/functions/v1/session-login')) envios.push(request.postDataJSON());
    });
    await abrir(page, backend);

    const botao = page.getByRole('button', { name: 'Acessos de teste' });
    await botao.focus();
    await page.keyboard.press('Enter');
    const dialogo = page.getByRole('dialog', { name: 'Acessos de teste' });
    await expect(dialogo).toBeVisible();

    // Tab dá a volta dentro do modal.
    for (let passo = 0; passo < 8; passo += 1) {
      await page.keyboard.press('Tab');
      expect(await dialogo.evaluate((elemento) => elemento.contains(document.activeElement))).toBe(true);
    }

    await dialogo.getByRole('button', { name: 'Usar este acesso de Administrador da empresa' }).focus();
    await page.keyboard.press('Enter');
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByLabel('E-mail')).toHaveValue('tenant_admin@demo.fluxid.invalid');
    await expect(page.getByLabel('Senha', { exact: true })).toHaveValue('FluxID-Demo-01!');
    const entrar = page.getByRole('button', { name: 'Entrar', exact: true });
    await expect(entrar).toBeFocused();
    expect(envios).toHaveLength(0);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
    expect(envios).toEqual([{ email: 'tenant_admin@demo.fluxid.invalid', password: 'FluxID-Demo-01!' }]);
  });

  test('Escape e o clique fora fecham sem mudar o formulário e devolvem o foco ao botão', async ({ page }) => {
    await abrir(page);
    const botao = page.getByRole('button', { name: 'Acessos de teste' });
    await botao.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(botao).toBeFocused();

    await botao.click();
    await page.mouse.click(4, 4);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(botao).toBeFocused();
    await expect(page.getByLabel('E-mail')).toHaveValue('');
  });

  test('o modal mostra os 5 perfis, cabe sem rolagem horizontal e não tem violação grave de acessibilidade', async ({ page }) => {
    await abrir(page);
    expect(await semRolagemHorizontal(page)).toBe(true);
    await page.getByRole('button', { name: 'Acessos de teste' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Acessos de teste' });
    await expect(dialogo.getByRole('listitem')).toHaveCount(5);
    await expect(dialogo.getByText(/Estes acessos são públicos/)).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
    for (const usar of await dialogo.getByRole('button', { name: /^Usar este acesso de / }).all()) {
      const caixa = await usar.boundingBox();
      expect(caixa!.height).toBeGreaterThanOrEqual(44);
    }
    const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious')).toEqual([]);
  });
});
