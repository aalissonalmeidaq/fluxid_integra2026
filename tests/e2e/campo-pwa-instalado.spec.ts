import { test, expect, type Page } from '@playwright/test';
import { lerFila } from './support/mock-offline';
import { entrar, planejar } from './support/trips-scenario';

// Spec 010, US5 (RF-028, CA-008): o aplicativo em produção (`build` e `preview`) é instalável, abre sem conexão com a estrutura, a viagem guardada, a fila e o
// indicador, diz em texto quando está instalado e não insiste depois de o convite ser recusado. A instalação no Android por HTTPS real é do roteiro com pessoa
// (T075): aqui se prova o que o navegador de teste consegue provar.
test.skip(({ browserName }) => browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');

async function prepararAparelho(page: Page) {
  const backend = await entrar(page);
  const andamento = planejar(backend, [['CIL-006', 'CIL-007']]);
  andamento.chamar('start_loading', { expected_version: 1 });
  await page.goto(`/viagens/${andamento.id}`);
  await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((banco) => banco.name).join(','))).toContain('fluxid-offline-access');
  await page.waitForTimeout(1_500);
  return { backend, id: andamento.id };
}

test.describe('aplicativo instalável', () => {
  test('o manifesto e o service worker de produção atendem ao que o navegador exige para instalar', async ({ page, request }) => {
    await page.goto('/visao-geral');
    const manifest = await (await request.get('/manifest.webmanifest')).json() as { name: string; short_name: string; display: string; start_url: string; icons: Array<{ sizes: string; type: string; purpose?: string }> };
    expect(manifest).toMatchObject({ name: 'FluxID', short_name: 'FluxID', display: 'standalone' });
    expect(manifest.start_url).toBeTruthy();
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon) => (icon.purpose ?? '').includes('maskable'))).toBe(true);
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active))).toBe(true);
    // Sem erros de instalabilidade na página (o navegador os registra no console).
    const erros: string[] = [];
    page.on('console', (mensagem) => { if (mensagem.type() === 'error' && /manifest|installab|service worker/i.test(mensagem.text())) erros.push(mensagem.text()); });
    await page.reload();
    expect(erros).toEqual([]);
  });

  test('o convite do navegador aparece uma vez; depois de recusado a tela não insiste', async ({ page }) => {
    await entrar(page);
    await page.evaluate(() => {
      const convite = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) });
      window.dispatchEvent(convite);
    });
    const botao = page.getByRole('button', { name: 'Instalar App' });
    await expect(botao).toBeVisible();
    await botao.click();
    await expect(botao).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Instalar App' })).toHaveCount(0);
  });

  test('depois de instalado, o menu da pessoa diz em texto', async ({ page }) => {
    await entrar(page);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await page.getByRole('button', { name: 'Minha conta' }).click();
    await expect(page.getByText('Aplicativo instalado neste aparelho.')).toBeVisible();
  });
});

test.describe('aplicativo aberto sem conexão', () => {
  test('abre com a estrutura, a viagem guardada, a fila e o indicador', async ({ page, context }) => {
    const { id } = await prepararAparelho(page);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();

    // Fecha e abre de novo, ainda sem conexão.
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'FluxID' })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();
    expect(await lerFila(page)).toHaveLength(1);
    // A tela Sincronização também abre (vem do cache do aplicativo).
    await page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Registros da viagem' }).getByRole('listitem')).toHaveCount(1);
  });
});
