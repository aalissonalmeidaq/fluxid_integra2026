import { test, expect, type Page, type Route } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

test.use({ serviceWorkers: 'block' });

// Uma só fonte de verdade para a conectividade: o aviso de offline nunca aparece junto de um indicador visual de conexão ativa
// ("Conectado: …" e o ponto verde). Sem rede o estado mostrado é "Sem conexão"; ao voltar, o "Conectado" volta e o aviso some.
async function entrar(page: Page): Promise<void> {
  const backend = new MockBackend();
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal1');
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
}

// A rota simulada responde mesmo com o contexto offline; por isso a perda de rede também aborta as requisições ao backend.
async function perderRede(page: Page): Promise<() => Promise<void>> {
  const abortar = (rota: Route) => rota.abort('internetdisconnected');
  await page.context().setOffline(true);
  await page.route('http://127.0.0.1:54321/**', abortar);
  return async () => {
    await page.unroute('http://127.0.0.1:54321/**', abortar);
    await page.context().setOffline(false);
  };
}

test.describe('Conectividade e aviso de offline', () => {
  test('sem rede o aviso aparece e o indicador de conexão ativa some; ao voltar, é o inverso', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O evento offline do WebKit do Playwright no Windows é instável com o backend simulado; o Chromium cobre o cenário.');
    await entrar(page);
    const conectado = page.getByText(/^Conectado:/);
    const aviso = page.getByText(/modo offline em operação/i);
    const barra = page.getByTestId('connection-bar');

    await expect(conectado).toBeVisible();
    await expect(aviso).toHaveCount(0);

    const voltar = await perderRede(page);
    await expect(aviso).toBeVisible({ timeout: 15_000 });
    // Nunca os dois juntos: sem "Conectado: …", sem o ponto verde, e a barra diz "Sem conexão".
    await expect(conectado).toHaveCount(0);
    await expect(page.getByTestId('status-icon')).toHaveCount(0);
    await expect(barra.getByText('Sem conexão', { exact: true })).toBeVisible();

    await voltar();
    await expect(aviso).toHaveCount(0);
    await expect(conectado).toBeVisible();
    await expect(barra.getByText('Sem conexão', { exact: true })).toHaveCount(0);
  });
});
