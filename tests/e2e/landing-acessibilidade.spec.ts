import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

// Spec 011, US5 (T044; RNF-001, RNF-002): a landing em 360, 768, 1440 e 1920 px (as larguras dos projetos do Playwright), nos temas claro
// e escuro do sistema: axe sem violação séria ou crítica, teclado do início ao fim com foco visível, âncoras, alvos de toque, sem rolagem
// horizontal e "reduzir movimento" sem animação.
test.use({ serviceWorkers: 'block' });

async function abrir(page: Page, opcoes: { reduzirMovimento?: boolean; esquema?: 'light' | 'dark' } = {}): Promise<void> {
  await page.emulateMedia({ reducedMotion: opcoes.reduzirMovimento === false ? 'no-preference' : 'reduce', colorScheme: opcoes.esquema ?? 'light' });
  await new MockBackend().install(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Saiba onde está cada cilindro/ })).toBeVisible();
}

// Rola até o fim com a roda do mouse (como uma pessoa) e volta ao topo, para as imagens sob demanda carregarem e o conteúdo da revelação
// aparecer antes das medições. A rolagem programática não dispara o IntersectionObserver no executor de testes; a roda, sim.
// No computador a landing anda slide a slide (apresentação, 15/10/2026): cada giro da roda leva a um slide, e um slide mais alto que a tela
// pede mais de um giro. Por isso a rolagem segue até chegar ao fim da página (com um limite de segurança), e não um número fixo de giros.
async function percorrer(page: Page, navegador: string): Promise<void> {
  const { altura, janela } = await page.evaluate(() => ({ altura: document.documentElement.scrollHeight, janela: window.innerHeight }));
  const passo = Math.max(300, janela - 100);
  const limite = Math.ceil(altura / passo) * 3;
  for (let giro = 0, y = passo; giro < limite; giro += 1, y += passo) {
    // O WebKit móvel não tem roda do mouse: lá a rolagem é programática (o observador dispara do mesmo jeito).
    if (navegador === 'webkit') await page.evaluate((posicao) => window.scrollTo(0, posicao), y);
    else await page.mouse.wheel(0, passo);
    // Dois quadros garantem que o observador de interseção rodou, mesmo com a máquina carregada (a página adaptada ao pitch é longa).
    await page.evaluate(() => new Promise((pronto) => requestAnimationFrame(() => requestAnimationFrame(pronto))));
    await page.waitForTimeout(120);
    const noFim = await page.evaluate(() => window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2);
    if (noFim) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const esquema of ['light', 'dark'] as const) {
  test(`sem violação séria ou crítica no axe e sem rolagem horizontal (tema ${esquema})`, async ({ page, browserName }) => {
    await abrir(page, { esquema });
    await percorrer(page, browserName);
    const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const graves = resultado.violations.filter((violacao) => violacao.impact === 'serious' || violacao.impact === 'critical');
    expect(graves.map((violacao) => `${violacao.id}: ${violacao.nodes.map((no) => no.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    expect(await semRolagemHorizontal(page)).toBe(true);
  });
}

test('"Pular para o conteúdo" é o primeiro foco, fica visível e leva o foco ao conteúdo principal', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'O Safari só passa por links com Option+Tab; o foco por teclado é validado no Chromium.');
  await abrir(page);
  await page.keyboard.press('Tab');
  const pular = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(pular).toBeFocused();
  await expect(pular).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main-content');
});

test('o teclado percorre a página na ordem do documento, com foco sempre visível e sem tabindex positivo', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'O Safari só passa por links com Option+Tab; o foco por teclado é validado no Chromium.');
  await abrir(page);
  expect(await page.locator('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])').count()).toBe(0);
  const interativos = await page.locator('a[href], button').evaluateAll((elementos) => elementos.filter((el) => (el as HTMLElement).offsetParent !== null).length);
  expect(interativos).toBeGreaterThan(10);

  let anterior: number | null = null;
  const visitados: string[] = [];
  for (let passo = 0; passo < interativos + 2; passo += 1) {
    await page.keyboard.press('Tab');
    const foco = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const estilo = getComputedStyle(el);
      const caixa = el.getBoundingClientRect();
      const todos = [...document.querySelectorAll('*')];
      return {
        indice: todos.indexOf(el),
        nome: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
        contorno: estilo.outlineStyle !== 'none' && parseFloat(estilo.outlineWidth) >= 2,
        visivel: caixa.width > 0 && caixa.height > 0,
      };
    });
    if (!foco) break;
    expect(foco.contorno, `anel de foco em "${foco.nome}"`).toBe(true);
    expect(foco.visivel, `"${foco.nome}" visível ao receber o foco`).toBe(true);
    if (anterior !== null) expect(foco.indice, `ordem do documento em "${foco.nome}"`).toBeGreaterThan(anterior);
    anterior = foco.indice;
    visitados.push(foco.nome);
  }
  expect(visitados.length).toBeGreaterThan(10);
  expect(visitados[0]).toBe('Pular para o conteúdo');
});

test('uma âncora leva à seção e o próximo Tab entra nela', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'O Safari só passa por links com Option+Tab; o foco por teclado é validado no Chromium.');
  await abrir(page);
  await page.getByRole('main').getByRole('link', { name: 'Ver todos os materiais do projeto' }).click();
  await expect(page).toHaveURL(/#materiais$/);
  await page.keyboard.press('Tab');
  const dentro = await page.evaluate(() => document.getElementById('materiais')?.contains(document.activeElement) ?? false);
  expect(dentro).toBe(true);
});

test('todo link e botão visível tem alvo de ao menos 24 por 24 px', async ({ page, browserName }) => {
  await abrir(page);
  await percorrer(page, browserName);
  const pequenos = await page.locator('a[href], button').evaluateAll((elementos) =>
    elementos
      // O link de pular só aparece ao receber o foco (1 px, recortado): não é alvo de toque enquanto invisível.
      .filter((el) => (el as HTMLElement).offsetParent !== null && !el.className.toString().includes('sr-only'))
      .map((el) => ({ nome: (el.textContent ?? '').trim().slice(0, 40), ...(({ width, height }) => ({ width, height }))(el.getBoundingClientRect()) }))
      .filter((caixa) => caixa.width < 24 || caixa.height < 24),
  );
  expect(pequenos).toEqual([]);
});

test('com "reduzir movimento": nenhuma animação em curso e nenhum conteúdo escondido', async ({ page }) => {
  await abrir(page, { reduzirMovimento: true });
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await page.locator('[data-revelar="pendente"]').count()).toBe(0);
});

test('sem a preferência: o que está abaixo da dobra aparece ao rolar e nada fica escondido no fim', async ({ page, browserName }) => {
  await abrir(page, { reduzirMovimento: false });
  await percorrer(page, browserName);
  await expect.poll(() => page.locator('[data-revelar="pendente"]').count()).toBe(0);
});
