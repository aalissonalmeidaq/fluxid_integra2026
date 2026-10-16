import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

// Spec 011, US1 (T018): a landing page pública na raiz, com backend simulado. O visitante entende a proposta e entra no sistema; a
// pessoa autenticada abre o sistema em um toque; as rotas internas continuam exigindo sessão.
test.use({ serviceWorkers: 'block' });

async function abrirRaiz(page: Page, backend = new MockBackend()): Promise<MockBackend> {
  await backend.install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Saiba onde está cada cilindro/ })).toBeVisible();
  return backend;
}

// Vai à raiz sem recarregar a página, para manter a sessão em memória (a navegação interna do aplicativo).
const irParaRaizSemRecarregar = (page: Page) =>
  page.evaluate(() => {
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new Event('fluxid:navigate'));
  });

async function entrarNoSistema(page: Page, backend: MockBackend): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
}

test.describe('Landing page (Spec 011, História 1)', () => {
  test('o visitante vê a landing, não o login, com a chamada e o botão de entrada sem rolar a página', async ({ page }) => {
    await abrirRaiz(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saiba onde está cada cilindro.');
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toHaveCount(0);
    const botao = page.getByRole('banner').getByRole('link', { name: 'Entrar no sistema' });
    await expect(botao).toBeVisible();
    const caixa = await botao.boundingBox();
    const altura = page.viewportSize()?.height ?? 0;
    expect(caixa).not.toBeNull();
    expect(caixa!.y + caixa!.height).toBeLessThanOrEqual(altura);
  });

  test('"Entrar no sistema" leva ao login', async ({ page }) => {
    await abrirRaiz(page);
    await page.getByRole('banner').getByRole('link', { name: 'Entrar no sistema' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
  });

  test('quem já está autenticado vê "Abrir o sistema", que leva à Visão geral', async ({ page }) => {
    const backend = new MockBackend();
    await entrarNoSistema(page, backend);
    await irParaRaizSemRecarregar(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Saiba onde está cada cilindro.');
    await expect(page.getByRole('link', { name: 'Entrar no sistema' })).toHaveCount(0);
    await page.getByRole('banner').getByRole('link', { name: 'Abrir o sistema' }).click();
    await expect(page).toHaveURL(/\/visao-geral$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  });

  test('depois de autenticar em /login, o endereço passa a /visao-geral', async ({ page }) => {
    await entrarNoSistema(page, new MockBackend());
    await expect(page).toHaveURL(/\/visao-geral$/);
  });

  test('uma rota interna sem sessão continua levando ao login', async ({ page }) => {
    const backend = new MockBackend();
    await backend.install(page);
    await page.goto('/cilindros');
    await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Saiba onde está cada cilindro.' })).toHaveCount(0);
  });

  test('a abertura ocupa a tela inteira ao entrar', async ({ page }) => {
    await abrirRaiz(page);
    const abertura = await page.locator('section#inicio').boundingBox();
    const altura = page.viewportSize()?.height ?? 0;
    expect(abertura).not.toBeNull();
    expect(abertura!.y).toBe(0);
    expect(abertura!.height).toBeGreaterThanOrEqual(altura);
  });

  test('a segunda ação da abertura leva aos vídeos, sem rolagem horizontal', async ({ page }) => {
    await abrirRaiz(page);
    await page.getByRole('main').getByRole('link', { name: 'Assistir ao pitch' }).first().click();
    await expect(page).toHaveURL(/#assistir-video-pitch$/);
    await expect(page.getByRole('region', { name: 'O pitch, do começo ao fim' }).getByRole('button', { name: 'Assistir: Vídeo do pitch' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('o vídeo toca na própria página: nada do YouTube carrega antes do clique, e o player entra no lugar da capa', async ({ page }) => {
    const pedidos: string[] = [];
    // O player é respondido localmente: o teste não depende da rede nem do YouTube.
    await page.route('https://www.youtube-nocookie.com/**', (rota) => rota.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
    page.on('request', (pedido) => { if (/youtube/.test(pedido.url())) pedidos.push(pedido.url()); });
    await abrirRaiz(page);
    await page.locator('#pitch').scrollIntoViewIfNeeded();
    expect(pedidos).toEqual([]);
    await page.getByRole('button', { name: 'Assistir: Vídeo do pitch' }).click();
    const player = page.locator('#assistir-video-pitch iframe');
    await expect(player).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/VBYOPnadE9M\?/);
    await expect(player).toBeFocused();
    expect(pedidos.every((url) => url.startsWith('https://www.youtube-nocookie.com/'))).toBe(true);
    await expect(page).toHaveURL(/\/(#pitch)?$/);
  });

  test('o link para os materiais leva à seção de materiais, sem rolagem horizontal', async ({ page }) => {
    await abrirRaiz(page);
    await page.getByRole('main').getByRole('link', { name: 'Ver todos os materiais do projeto' }).click();
    await expect(page).toHaveURL(/#materiais$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
