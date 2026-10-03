import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

test.describe('PWA e Funcionamento Offline (US4)', () => {
  test('inclui link para o manifest e tags essenciais de PWA no HTML', async ({ page }) => {
    await page.goto('/');

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached();

    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#1249B8');
  });

  test('manifest webmanifest é acessível e contém metadados corretos', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const json = await response.json();
    expect(json.name).toBe('FluxID');
    expect(json.short_name).toBe('FluxID');
    expect(json.display).toBe('standalone');
  });

  test('registra, ativa, controla a página e carrega o app shell', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();

    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const serviceWorker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return Boolean(registration.active);
    });
    expect(serviceWorker).toBe(true);

    await expect(page.getByRole('main')).toBeVisible();
  });

  test('abre o app shell sem rede quando a emulação offline é suportada', async ({ page, context, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.'
    );

    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'FluxID' })).toBeVisible();
      await expect(page.getByRole('main')).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test('mantém o shell previsível quando recurso remoto do Supabase falha', async ({ page }) => {
    await page.goto('/');
    await page.route('**/auth/v1/**', (route) => route.abort('failed'));

    const remoteResult = await page.evaluate(async () => {
      try {
        await fetch('/auth/v1/health');
        return 'resolved';
      } catch {
        return 'failed';
      }
    });

    expect(remoteResult).toBe('failed');
    await expect(page.getByRole('main')).toBeVisible();
  });
});

// Spec 002 (RNF-007, CA-011): a PWA guarda apenas o app shell. Nada de Auth, Data API, Storage ou Functions
// pode ficar no cache do navegador, e uma falha de rede nunca pode virar confirmação de uma operação.
const SUPABASE_PATHS = ['/auth/v1', '/rest/v1', '/storage/v1', '/functions/v1', '/graphql/v1', '/realtime/v1'];

async function waitForControl(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test.describe('PWA e dados protegidos (Spec 002)', () => {
  test('o cache do app shell não guarda nenhuma rota de Auth, Data, Storage ou Functions', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Com o service worker ativo o WebKit responde antes da interceptação de rede do Playwright, então o backend simulado não é garantido; o Chromium cobre o cenário.');
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus('aal2');
    await backend.install(page);
    await waitForControl(page);

    await page.getByLabel('E-mail').fill('admin-a@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    await page.goto('/perfil');
    await expect(page.getByRole('heading', { name: 'Meu perfil' })).toBeVisible();

    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
      }
      return urls;
    });
    expect(cached.length, 'o app shell precisa estar em cache').toBeGreaterThan(0);
    expect(cached.filter((path) => SUPABASE_PATHS.some((prefix) => path.startsWith(prefix)))).toEqual([]);
  });

  test('uma navegação offline a rota de Auth, Data, Storage ou Functions não recebe o app shell', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    await waitForControl(page);
    await context.setOffline(true);
    try {
      // Controle positivo: uma rota interna continua abrindo o app shell offline.
      const control = await page.goto('/perfil');
      expect(control?.fromServiceWorker()).toBe(true);
      // Uma página nova por rota: depois de uma navegação com erro a página atual não serve de referência.
      for (const prefix of SUPABASE_PATHS) {
        const probe = await context.newPage();
        const result = await probe.goto(`${prefix}/recurso`).then((response) => response?.fromServiceWorker() ? 'shell' : 'network', () => 'falhou');
        await probe.close();
        expect(result, `${prefix} offline`).toBe('falhou');
      }
    } finally {
      await context.setOffline(false);
    }
  });

  test('offline, uma alteração sensível não é confirmada e a interface informa a falha', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    const backend = new MockBackend();
    backend.loginResponses = [backend.authenticated()];
    backend.statusResponse = backend.activeStatus('aal1');
    await backend.install(page);
    await waitForControl(page);
    await page.getByLabel('E-mail').fill('operador-a@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Minha conta' })).toBeVisible();
    await page.goto('/perfil');
    await expect(page.getByLabel('Nome de exibição')).toBeVisible();

    const callsBeforeOffline = backend.calls.length;
    await context.setOffline(true);
    // page.route responde mesmo com a emulação offline; o corte de rede real é simulado abortando o Supabase.
    await page.route(/\/(auth|rest|storage|functions)\/v1\//, (route) => route.abort('internetdisconnected'));
    try {
      await page.getByLabel('Nome de exibição').fill('Nome Alterado Offline');
      await page.getByRole('button', { name: 'Salvar nome' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: /perfil atualizado/i })).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
    expect(backend.calls.slice(callsBeforeOffline)).toEqual([]);
  });

  test('retoma o app shell depois de voltar a rede', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    await waitForControl(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'FluxID' })).toBeVisible();
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  });
});

// Spec 003 (RNF-001, RF-030): a fonte, o logotipo e os ícones são do próprio aplicativo e ficam no precache do service worker.
test.describe('PWA offline com a identidade visual (Spec 003)', () => {
  test('sem rede o shell abre, a Montserrat vem do precache e nenhuma requisição externa é tentada', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');
    await waitForControl(page);

    const requisicoes: string[] = [];
    page.on('request', (requisicao) => requisicoes.push(requisicao.url()));
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'FluxID' })).toBeVisible();
      await page.evaluate(async () => { await document.fonts.ready; });
      const fonte = await page.evaluate(() => ({
        disponivel: document.fonts.check('1em "Montserrat Variable"'),
        carregadas: [...document.fonts].filter((face) => face.family.includes('Montserrat') && face.status === 'loaded').length,
      }));
      expect(fonte.disponivel, 'document.fonts.check da Montserrat').toBe(true);
      expect(fonte.carregadas, 'Faces da Montserrat carregadas do precache').toBeGreaterThan(0);
      const logotipo = page.getByRole('img', { name: 'FluxID' });
      await expect(logotipo).toBeVisible();
      expect(await logotipo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), 'Logotipo carregado do precache').toBe(true);
    } finally {
      await context.setOffline(false);
    }
    const externas = requisicoes.filter((url) => { const { protocol, hostname } = new URL(url); return /^https?:$/.test(protocol) && hostname !== 'localhost' && hostname !== '127.0.0.1'; });
    expect(externas, 'Requisições a domínios externos sem rede.').toEqual([]);
  });
});
