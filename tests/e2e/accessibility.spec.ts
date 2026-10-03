import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MockBackend } from './support/mock-backend';

test.describe('Acessibilidade e Navegação por Teclado (US4)', () => {
  test('não possui violações críticas ou graves de acessibilidade (WCAG 2.2 AA / axe-core)', async ({ page }) => {
    await page.goto('/');

    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    const blockingViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );

    const evidence = blockingViolations
      .map((violation) => `${violation.impact}: ${violation.id} em ${violation.nodes.map((node) => node.target.join(', ')).join('; ')}`)
      .join('\n');

    expect(blockingViolations, evidence || 'Nenhuma violação crítica ou grave encontrada.').toEqual([]);
  });

  test('permite navegação por teclado com foco visível e ordem lógica', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'O driver WebKit do Playwright no Windows não encaminha Tab ao foco da página neste cenário automatizado.'
    );
    await page.goto('/');
    await page.getByRole('heading', { name: 'Bem-vindo de volta' }).waitFor();

    const skipLink = page.getByRole('link', { name: 'Pular para o conteúdo principal' });
    const main = page.getByRole('main');

    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();

    const focusStyle = await skipLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    expect(focusStyle.outlineStyle !== 'none' || focusStyle.boxShadow !== 'none').toBe(true);

    await page.keyboard.press('Enter');
    await expect(main).toBeFocused();
  });

  test('permite acionamento por teclado de controles interativos e evita armadilhas de foco', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'O driver WebKit do Playwright no Windows não encaminha Tab e Enter ao foco da página neste cenário automatizado.'
    );
    // Interrompe requisições para forçar o estado offline e exibir o controle de reconexão.
    let abortedRequests = 0;
    await page.route('**/auth/v1/**', (route) => {
      abortedRequests += 1;
      return route.abort('failed');
    });
    await page.goto('/');
    await page.getByRole('heading', { name: 'Bem-vindo de volta' }).waitFor();

    const reconnectBtn = page.getByRole('button', { name: /reconectar|tentar reconectar/i });
    await expect(reconnectBtn).toBeVisible({ timeout: 10000 });

    // Navega com Tab até o botão Reconectar: no alto da página em telas largas, no fim dela no celular (ordem do DOM).
    for (let i = 0; i < 15 && !(await reconnectBtn.evaluate((el) => el === document.activeElement)); i += 1) {
      await page.keyboard.press('Tab');
    }

    await expect(reconnectBtn).toBeFocused();

    // Aciona controle pelo teclado
    const requestsBeforeReconnect = abortedRequests;
    await page.keyboard.press('Enter');
    await expect.poll(() => abortedRequests).toBeGreaterThan(requestsBeforeReconnect);

    // Valida ausência de armadilhas de foco recuando com Shift+Tab
    await page.keyboard.press('Shift+Tab');
    await expect(reconnectBtn).not.toBeFocused();
  });
});

// Spec 002: toda rota nova é varrida pelo axe (contraste incluso, pelas regras WCAG 2.2 AA) e o teclado é exercitado
// nos diálogos. Usa o backend simulado, sem service worker, para o resultado não depender de rede.
const AUTHENTICATED_ROUTES = [
  { path: '/admin/membros', ready: 'Pessoas do tenant' },
  { path: '/admin/papeis', ready: null },
  { path: '/admin/auditoria', ready: null },
  { path: '/admin/tenants', ready: null },
  { path: '/perfil', ready: 'Meu perfil' },
] as const;

async function signIn(page: Page, backend: MockBackend): Promise<void> {
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
}

async function expectNoBlockingViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  const evidence = blocking
    .map((violation) => `${violation.impact}: ${violation.id} em ${violation.nodes.map((node) => node.target.join(', ')).join('; ')}`)
    .join('\n');
  expect(blocking, evidence || 'Nenhuma violação crítica ou grave encontrada.').toEqual([]);
}

test.describe('Acessibilidade das telas de identidade (Spec 002)', () => {
  test.use({ serviceWorkers: 'block' });

  test('entrada e recuperação de senha', async ({ page }) => {
    await new MockBackend().install(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
    await expectNoBlockingViolations(page);
    await page.getByRole('link', { name: /esqueci minha senha/i }).or(page.getByRole('button', { name: /esqueci minha senha/i })).click();
    await expect(page.getByRole('heading', { name: 'Recuperar acesso' })).toBeVisible();
    await expectNoBlockingViolations(page);
  });

  for (const route of AUTHENTICATED_ROUTES) {
    test(`${route.path} não tem violações críticas ou graves`, async ({ page }) => {
      await signIn(page, new MockBackend());
      await page.goto(route.path);
      if (route.ready) await expect(page.getByRole('heading', { name: route.ready })).toBeVisible();
      else await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
      await expectNoBlockingViolations(page);
    });
  }

  test('o diálogo de confirmação prende o foco, fecha com Escape e devolve o foco ao acionador', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows não encaminha Tab ao foco da página neste cenário automatizado.');
    await signIn(page, new MockBackend());
    await page.goto('/admin/membros');
    const trigger = page.getByRole('table', { name: 'Pessoas vinculadas' }).getByRole('button').first();
    await trigger.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectNoBlockingViolations(page);

    // O foco permanece dentro do diálogo em qualquer sentido de navegação.
    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('com movimento reduzido nenhuma animação contínua fica ativa', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, new MockBackend());
    await page.goto('/admin/membros');
    await expect(page.getByRole('heading', { name: 'Pessoas do tenant' })).toBeVisible();
    const running = await page.evaluate(() =>
      document.getAnimations().filter((animation) => animation.playState === 'running' && (animation.effect?.getTiming().iterations ?? 1) === Infinity).length
    );
    expect(running).toBe(0);
  });
});
