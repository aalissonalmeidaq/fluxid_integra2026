import { test, expect, type Page } from '@playwright/test';
import { lerFila, religarRede } from './support/mock-offline';
import { entrar, planejar } from './support/trips-scenario';

// Spec 010, US1 e US5 (RF-016a, CA-006): com o aplicativo já aberto uma vez com conexão, fechar, cortar a rede e abrir de novo abre autenticado pelo acesso offline
// restrito, com a viagem guardada, a fila e o indicador; passadas 8 horas o aplicativo pede nova entrada, e a fila continua no aparelho.
// Aqui o service worker fica ligado (é ele que serve o aplicativo sem rede), então o teste só roda onde o driver aceita setOffline com service worker.
test.skip(({ browserName }) => browserName === 'webkit', 'O driver WebKit do Playwright no Windows apresenta falha de IPC ao combinar setOffline com service worker.');

async function prepararAparelho(page: Page) {
  const backend = await entrar(page);
  const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
  carregando.chamar('start_loading', { expected_version: 1 });
  await page.goto(`/viagens/${carregando.id}`);
  await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
  // A cópia da viagem e o registro do acesso offline já estão no aparelho.
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((banco) => banco.name).sort().join(','))).toContain('fluxid-offline-access');
  await page.waitForTimeout(1_500);
  return { backend, id: carregando.id };
}

test.describe('abrir o aplicativo sem conexão', () => {
  test('fecha e abre sem rede: abre autenticado, a viagem guardada abre e dá para conferir, com a fila no lugar', async ({ page, context }) => {
    const { backend, id } = await prepararAparelho(page);

    await context.setOffline(true);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await expect(page.getByText('Sem conexão. O que você registrar fica neste aparelho e será enviado quando houver conexão.')).toBeVisible();
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();

    // Fecha de novo e abre outra vez sem rede: a fila e o indicador continuam.
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();
    expect(await lerFila(page)).toHaveLength(1);
    expect(backend.trips.itemsOf(id).filter((item) => item.item_status === 'checked')).toHaveLength(0);

    await religarRede(context, page);
    await expect.poll(() => backend.trips.itemsOf(id).filter((item) => item.item_status === 'checked').length).toBe(1);
  });

  test('passadas 8 horas sem confirmação, o aplicativo pede nova entrada e a fila continua', async ({ page, context }) => {
    const { id } = await prepararAparelho(page);
    await context.setOffline(true);
    await page.goto(`/viagens/${id}`);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();

    // Avança o relógio do navegador em 8 horas e 1 minuto e abre de novo.
    await page.clock.install({ time: new Date(Date.now() + 8 * 60 * 60 * 1000 + 60_000) });
    await page.goto(`/viagens/${id}`);
    // Passado o teto, o acesso offline vale menos e o aplicativo pede nova entrada; o que estava na fila continua no aparelho.
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
    expect(await lerFila(page)).toHaveLength(1);
  });
});
