import { test, expect, type Page } from '@playwright/test';
import { installFieldReaders } from './support/mock-field-reading';
import { allowLocation } from './support/mock-geolocation';
import { entrar, planejar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 009, US4 (RF-015, RF-022, CA-005, CA-007): sem conexão, a leitura e a posição abrem, mas conferir, entregar e consultar ficam
// desabilitados com o motivo em texto; nada é gravado e nada fica no aparelho (a fila offline é da Spec 010); ao reconectar, volta a funcionar.
async function guardadoNoAparelho(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const partes: string[] = [JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage })];
    const bancos = (await indexedDB.databases?.()) ?? [];
    for (const banco of bancos) {
      if (!banco.name) continue;
      const aberto = await new Promise<IDBDatabase>((resolve, reject) => {
        const pedido = indexedDB.open(banco.name!);
        pedido.onsuccess = () => resolve(pedido.result);
        pedido.onerror = () => reject(pedido.error);
      });
      for (const nome of Array.from(aberto.objectStoreNames)) {
        const registros = await new Promise<unknown[]>((resolve, reject) => {
          const pedido = aberto.transaction(nome).objectStore(nome).getAll();
          pedido.onsuccess = () => resolve(pedido.result);
          pedido.onerror = () => reject(pedido.error);
        });
        partes.push(`${banco.name}/${nome}:${JSON.stringify(registros)}`);
      }
      aberto.close();
    }
    return partes.join('\n');
  });
}

const leitor = (page: Page) => page.getByRole('dialog', { name: 'Ler cilindro' });

// O leitor é baixado na primeira abertura. No app instalado o arquivo fica em cache (precache da PWA); aqui o service worker está bloqueado,
// então o teste abre e fecha o leitor uma vez com conexão, para o arquivo já estar carregado quando a rede cair.
async function preCarregarLeitor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ler cilindro' }).click();
  await expect(leitor(page)).toBeVisible();
  await leitor(page).getByRole('button', { name: 'Fechar' }).click();
  await expect(leitor(page)).toHaveCount(0);
}

test.describe('Leitura e posição sem conexão', () => {
  test('conferência: o campo de código fica desabilitado com o motivo, o leitor abre e não confere nada, e volta ao reconectar', async ({ page, context }) => {
    const readers = await installFieldReaders(page, { camera: true });
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await page.goto(`/viagens/${carregando.id}`);
    await expect(page.getByLabel('Código do cilindro')).toBeVisible();
    await preCarregarLeitor(page);

    await context.setOffline(true);
    await expect(page.getByRole('button', { name: 'Conferir código' })).toBeDisabled();
    await expect(page.getByText('Sem conexão. Registrar exige conexão.').first()).toBeVisible();

    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page)).toBeVisible();
    await readers.scan('QR-006');
    await expect(leitor(page).getByRole('status')).toContainText('Sem conexão. Registrar exige conexão.');
    expect(backend.trips.itemsOf(carregando.id).filter((item) => item.item_status === 'checked')).toHaveLength(0);
    await leitor(page).getByRole('button', { name: 'Fechar' }).click();

    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Conferir código' })).toBeEnabled();
    await page.getByLabel('Código do cilindro').fill('QR-006');
    await page.getByRole('button', { name: 'Conferir código' }).click();
    await expect(page.getByText('1 de 2 conferidos')).toBeVisible();
  });

  test('chegada e entrega com posição: desabilitadas sem conexão, e nenhum código nem coordenada fica no aparelho', async ({ page, context }) => {
    await installFieldReaders(page, { camera: true });
    await allowLocation(page, { latitude: -23.55, longitude: -46.633, accuracy: 12 });
    const backend = await entrar(page);
    const andamento = planejar(backend, [['CIL-008'], ['CIL-009']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1, 2], iniciar: true });
    await page.goto(`/viagens/${andamento.id}`);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('Situação da parada: No local')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(dialogo.getByText('Origem: GPS')).toBeVisible();
    await dialogo.getByLabel('Código do cilindro').fill('QR-008');

    await context.setOffline(true);
    await expect(dialogo.getByRole('button', { name: 'Marcar como entregue' })).toBeDisabled();
    await expect(dialogo.getByText('Sem conexão. Registrar exige conexão.').first()).toBeVisible();
    const guardado = await guardadoNoAparelho(page);
    expect(guardado).not.toMatch(/23[.,]55|46[.,]63|QR-008/);
    await context.setOffline(false);
  });

  test('sem conexão e com o leitor ainda não carregado, a tela não cai: o aviso explica, fecha e, com conexão, abre', async ({ page, context, browserName }) => {
    await installFieldReaders(page, { camera: true });
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await page.goto(`/viagens/${carregando.id}`);
    await expect(page.getByRole('button', { name: 'Ler cilindro' })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page).getByRole('alert')).toContainText('Não foi possível abrir a leitura agora');
    await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible();
    await leitor(page).getByRole('button', { name: 'Fechar' }).click();
    await expect(leitor(page)).toHaveCount(0);

    // O navegador guarda a falha do carregamento até a página recarregar; com a conexão de volta, recarregar abre a leitura. O WebKit guarda
    // a falha também depois de recarregar (comportamento do navegador, fora do nosso código), então a reabertura só é conferida no Chromium.
    await context.setOffline(false);
    if (browserName !== 'chromium') return;
    await page.reload();
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page).getByText(/Aponte a câmera/)).toBeVisible();
  });

  test('chegada com a posição fica desabilitada sem conexão', async ({ page, context }) => {
    const backend = await entrar(page);
    const andamento = planejar(backend, [['CIL-008'], ['CIL-009']], { placa: 'GHI1J23', motorista: 'Bruno Condutor', unidades: [1, 2], iniciar: true });
    await page.goto(`/viagens/${andamento.id}`);
    const botao = page.getByRole('button', { name: 'Chegada com a posição da parada 1 (Matriz)' });
    await expect(botao).toBeEnabled();
    await context.setOffline(true);
    await expect(botao).toBeDisabled();
    await context.setOffline(false);
    await expect(botao).toBeEnabled();
  });

  test('consulta: o leitor abre, avisa que a consulta exige conexão e não abre nenhum cilindro', async ({ page, context }) => {
    const readers = await installFieldReaders(page, { camera: true });
    await entrar(page);
    await page.goto('/cilindros');
    await expect(page.getByRole('button', { name: 'Ler cilindro' })).toBeVisible();
    await preCarregarLeitor(page);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    await expect(leitor(page)).toBeVisible();
    await readers.scan('QR-003');
    await expect(leitor(page).getByRole('status')).toContainText('Sem conexão. A consulta do cilindro exige conexão.');
    await expect(page).toHaveURL(/\/cilindros$/);
    await context.setOffline(false);
  });
});
