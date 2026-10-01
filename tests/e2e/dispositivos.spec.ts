import { test, expect, type Page } from '@playwright/test';
import { MockBackend, threeSessions } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// T075 (RNF-002, RNF-005 e casos de borda): validações de dispositivo reproduzidas por emulação. Elas NÃO substituem o
// teste em aparelho real; o que foi e o que não foi coberto fica registrado em specs/003-design-system-telas/validation.md.
test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop-chromium', 'As emulações de dispositivo definem o próprio viewport e rodam uma vez, em Chromium.');
});

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Fonte indisponível ou lenta no primeiro acesso', () => {
  test('sem a Montserrat a tela cai na fonte de reserva sem quebrar o layout', async ({ page }) => {
    await page.route(/\.woff2?(\?.*)?$/, (rota) => rota.abort('failed'));
    await new MockBackend().install(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    const carregadas = await page.evaluate(() => [...document.fonts].filter((face) => face.status === 'loaded').length);
    expect(carregadas, 'Nenhuma face da fonte carregou').toBe(0);
    const familia = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(familia).toContain('Arial');
    expect(await semRolagemHorizontal(page)).toBe(true);
    // Campos e botão continuam visíveis e do tamanho de toque.
    for (const controle of [page.getByLabel('E-mail'), page.getByLabel('Senha', { exact: true }), page.getByRole('button', { name: 'Entrar', exact: true })]) {
      const caixa = await controle.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('com a fonte muito lenta a tela já é utilizável antes de ela chegar (font-display: swap)', async ({ page }) => {
    await page.route(/\.woff2?(\?.*)?$/, async (rota) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await rota.continue();
    });
    await new MockBackend().install(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Entrar no FluxID' })).toBeVisible({ timeout: 2000 });
    await page.getByLabel('E-mail').fill('ana@e2e.invalid');
    await expect(page.getByLabel('E-mail')).toHaveValue('ana@e2e.invalid');
  });
});

test.describe('Teclado virtual aberto em tela pequena (simulado por altura reduzida)', () => {
  test('o campo em edição e a mensagem de erro continuam alcançáveis', async ({ page }) => {
    // 360 por 320 px aproxima o espaço que sobra com o teclado virtual aberto em um celular de 640 px de altura.
    await page.setViewportSize({ width: 360, height: 320 });
    const backend = new MockBackend();
    backend.loginResponses = [{ status: 401, body: { code: 'INVALID_CREDENTIALS' } }];
    await backend.install(page);
    await page.goto('/');
    await page.getByLabel('E-mail').fill('ana@e2e.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Forte-1');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    const senha = page.getByLabel('Senha', { exact: true });
    await expect(senha).toBeFocused();
    await expect(senha).toBeInViewport();
    const erro = page.getByRole('alert');
    await erro.scrollIntoViewIfNeeded();
    await expect(erro).toBeInViewport();
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
});

test.describe('Diálogo com conteúdo longo', () => {
  for (const [orientacao, largura, altura] of [['retrato', 360, 640], ['paisagem', 640, 360]] as const) {
    test(`em ${largura} por ${altura} px (${orientacao}) rola por dentro e as ações continuam alcançáveis`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: altura });
      const backend = new MockBackend();
      backend.loginResponses = [{ status: 409, body: { code: 'SESSION_LIMIT_REACHED', sessions: threeSessions } }];
      await backend.install(page);
      await page.goto('/');
      await page.getByLabel('E-mail').fill('ana@e2e.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('Senha-E2E-Forte-1');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();

      const dialogo = page.getByRole('dialog', { name: /limite de sessões/i });
      await expect(dialogo).toBeVisible();
      const medidas = await dialogo.evaluate((el) => ({
        altura: el.getBoundingClientRect().height,
        conteudo: el.scrollHeight,
        visivel: el.clientHeight,
        rolagemDaPagina: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      // O diálogo nunca passa da altura da janela; se o conteúdo é maior, a rolagem é interna.
      expect(medidas.altura).toBeLessThanOrEqual(altura);
      if (medidas.conteudo > medidas.visivel) expect(['auto', 'scroll']).toContain(await dialogo.evaluate((el) => getComputedStyle(el).overflowY));

      const cancelar = dialogo.getByRole('button', { name: 'Cancelar' });
      await cancelar.scrollIntoViewIfNeeded();
      await expect(cancelar).toBeInViewport();
      const confirmar = dialogo.getByRole('button', { name: /encerrar sessão selecionada/i });
      await confirmar.scrollIntoViewIfNeeded();
      await expect(confirmar).toBeInViewport();
      expect(await semRolagemHorizontal(page)).toBe(true);
    });
  }
});
