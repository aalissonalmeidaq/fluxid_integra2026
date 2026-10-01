import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

async function enter(page: Page, backend: MockBackend): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('operador-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

// Abaixo de 768 px o menu fica recolhido atrás do botão "Menu"; a partir de 768 px ele já está visível.
async function abrirMenuSeRecolhido(page: Page): Promise<void> {
  const botao = page.getByRole('button', { name: 'Menu' });
  if (await botao.isVisible()) await botao.click();
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('App Shell: responsividade e desempenho (US4 e Spec 003)', () => {
  test('shell carrega dentro do orçamento de 2000 ms e sem rolagem horizontal', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');

    const heading = page.getByRole('heading', { level: 1, name: 'FluxID' });
    await expect(heading).toBeVisible();

    const duration = Date.now() - startTime;
    expect(duration, `O shell levou ${duration} ms para exibir o título FluxID.`).toBeLessThanOrEqual(2000);

    expect(await semRolagemHorizontal(page)).toBe(true);
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('deslogado: barra de conexão e reconectar, sem dados de organização, na largura do projeto', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('connection-bar')).toBeVisible();
    await expect(page.getByText('Organização ativa:')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Meu perfil' })).toHaveCount(0);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('autenticado: perfil e sair acessíveis sem rolagem horizontal', async ({ page }) => {
    await enter(page, new MockBackend());
    await abrirMenuSeRecolhido(page);
    const perfil = page.getByRole('link', { name: 'Meu perfil' });
    const sair = page.getByRole('button', { name: 'Sair' });
    for (const controle of [perfil, sair]) {
      await expect(controle).toBeVisible();
      const caixa = await controle.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    expect(await semRolagemHorizontal(page)).toBe(true);
  });

  test('o botão de instalar o PWA tem alvo de 44 px e contraste do botão do padrão', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible();
    await page.evaluate(() => {
      const evento = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      evento.prompt = async () => undefined;
      evento.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(evento);
    });
    const instalar = page.getByRole('button', { name: 'Instalar App' });
    await expect(instalar).toBeVisible();
    const caixa = await instalar.boundingBox();
    expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(44);
    // Botão secundário: azul-profundo (#1249B8) sobre branco, 7,86:1.
    const cores = await instalar.evaluate((elemento) => {
      const estilo = getComputedStyle(elemento);
      return { cor: estilo.color, fundo: estilo.backgroundColor };
    });
    expect(cores.cor).toBe('rgb(18, 73, 184)');
    expect(cores.fundo).toBe('rgb(255, 255, 255)');
  });

  test('reflow a 320 px: sem rolagem horizontal e com o cabeçalho acessível', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await enter(page, new MockBackend());
    await abrirMenuSeRecolhido(page);
    await expect(page.getByRole('link', { name: 'Meu perfil' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});
