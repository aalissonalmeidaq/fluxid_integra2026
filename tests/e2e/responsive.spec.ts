import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// Larguras de 360 px até desktop amplo (AGENTS.md). O projeto do Playwright define o navegador; a largura vem daqui.
const VIEWPORTS = [
  { name: '360 px', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop amplo', width: 1920, height: 1080 },
] as const;

// WCAG 2.2 SC 2.5.8 (AA): alvos de ponteiro de pelo menos 24 x 24 px.
const MIN_TARGET = 24;

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

async function expectAdaptiveLayout(page: Page, width: number): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'sem rolagem horizontal da página').toBeLessThanOrEqual(0);

  const tooSmall = await page.evaluate((min) => {
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"]';
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visuallyHidden = element.className.toString().includes('sr-only');
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && !visuallyHidden && element.closest('[hidden]') === null;
      })
      .filter((element) => {
        if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return false;
        const box = element.getBoundingClientRect();
        // Links dentro de texto corrido são exceção prevista pela WCAG (alvo em linha).
        const inline = element.tagName === 'A' && getComputedStyle(element).display === 'inline';
        return !inline && (box.width < min || box.height < min);
      })
      .map((element) => `${element.tagName.toLowerCase()}:${(element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 30)}`);
  }, MIN_TARGET);
  expect(tooSmall, `alvos menores que ${MIN_TARGET} px em ${width} px`).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test.describe(`Responsividade em ${viewport.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test('entrada e recuperação de senha', async ({ page }) => {
      const backend = new MockBackend();
      await backend.install(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
      await expectAdaptiveLayout(page, viewport.width);

      await page.getByRole('link', { name: /esqueci minha senha/i }).or(page.getByRole('button', { name: /esqueci minha senha/i })).click();
      await expect(page.getByRole('heading', { name: 'Recuperar acesso' })).toBeVisible();
      await expectAdaptiveLayout(page, viewport.width);
    });

    for (const route of [
      { path: '/admin/membros', heading: 'Pessoas do tenant' },
      { path: '/admin/papeis', heading: null },
      { path: '/admin/auditoria', heading: null },
      { path: '/admin/tenants', heading: null },
      { path: '/perfil', heading: 'Meu perfil' },
    ]) {
      test(`área autenticada ${route.path}`, async ({ page }) => {
        const backend = new MockBackend();
        await signIn(page, backend);
        await page.goto(route.path);
        if (route.heading) await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
        else await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
        await expectAdaptiveLayout(page, viewport.width);
      });
    }

    test('o conteúdo não fica escondido atrás do cabeçalho e o menu continua alcançável', async ({ page }) => {
      const backend = new MockBackend();
      await signIn(page, backend);
      await expect(page.getByRole('button', { name: 'Minha conta' })).toBeInViewport();
    });
  });
}
