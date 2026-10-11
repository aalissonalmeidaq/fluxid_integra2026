import { test, expect, type Page } from '@playwright/test';
import { entrar, entregar, planejar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 008, história 7: sem conexão a estrutura aparece, as escritas ficam desabilitadas com o motivo e nada é guardado no aparelho (a
// fila offline é da Fase 5); resposta perdida mostra "resultado desconhecido" e repetir não duplica; sessão expirada não grava nada.
const RECEBEDOR = 'Recebedor Sigiloso';

// Tudo o que o aparelho guarda (localStorage, sessionStorage e IndexedDB), em texto, para provar que nenhum dado de viagem ficou nele.
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

test.describe('Viagens sem conexão e com falhas', () => {
  test('sem conexão a estrutura continua na tela, as escritas ficam desabilitadas com o motivo e voltam ao reconectar', async ({ page, context }) => {
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await page.goto(`/viagens/${carregando.id}`);
    const conferir = page.getByRole('button', { name: 'Conferir CIL-006' });
    await expect(conferir).toBeEnabled();

    await context.setOffline(true);
    await expect(page.getByText('Sem conexão. As ações que alteram a viagem exigem conexão.')).toBeVisible();
    await expect(page.getByText('Esta operação exige conexão.')).toBeVisible();
    // A estrutura continua: título, paradas e cilindros.
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem n.º 1' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Paradas da viagem' })).toBeVisible();
    for (const nome of ['Conferir CIL-006', 'Conferir CIL-007', 'Iniciar viagem', 'Cancelar viagem', 'Desfazer carregamento']) {
      await expect(page.getByRole('button', { name: nome })).toBeDisabled();
    }
    // Nada é enviado nem guardado enquanto a conexão não volta.
    const pedidos = backend.trips.receivedRequestIds.length;
    await conferir.click({ force: true }).catch(() => undefined);
    expect(backend.trips.receivedRequestIds).toHaveLength(pedidos);
    const guardado = await guardadoNoAparelho(page);
    for (const dado of [carregando.id, 'CIL-006', 'CIL-007', RECEBEDOR]) expect(guardado, `guardou "${dado}" no aparelho`).not.toContain(dado);

    await context.setOffline(false);
    await expect(conferir).toBeEnabled();
    await conferir.click();
    await expect(page.getByRole('status').filter({ hasText: 'Cilindro CIL-006 conferido.' })).toHaveCount(1);
  });

  test('o formulário sem conexão avisa e não envia', async ({ page, context }) => {
    const backend = await entrar(page);
    await page.goto('/viagens/nova');
    const formulario = page.getByRole('dialog', { name: 'Planejar viagem' });
    await expect(formulario).toBeVisible();
    await context.setOffline(true);
    await expect(formulario.getByText('Sem conexão. Esta operação exige conexão e nada é guardado neste aparelho.')).toBeVisible();
    await expect(formulario.getByRole('button', { name: 'Planejar viagem' })).toBeDisabled();
    expect(backend.trips.trips).toHaveLength(0);
    await context.setOffline(false);
    await expect(formulario.getByRole('button', { name: 'Planejar viagem' })).toBeEnabled();
  });

  test('resposta perdida: mostra "resultado desconhecido" e repetir leva o mesmo pedido, sem duplicar', async ({ page }) => {
    const backend = await entrar(page);
    const { id } = planejar(backend, [['CIL-006']]);
    await page.goto(`/viagens/${id}`);
    backend.trips.loseNextCommandResponse = true;
    await page.getByRole('button', { name: 'Iniciar carregamento' }).click();
    await expect(page.getByRole('alert')).toContainText('Resultado desconhecido');
    // O servidor gravou: a viagem já está em carregamento no backend.
    expect(backend.trips.trips[0]!.status).toBe('loading');
    expect(backend.trips.trips[0]!.version).toBe(2);

    await page.getByRole('button', { name: 'Iniciar carregamento' }).click();
    await expect(page.getByText('Situação da viagem: Carregando')).toBeVisible();
    const ids = backend.trips.receivedRequestIds;
    expect(ids.at(-1)).toBe(ids.at(-2));
    expect(backend.trips.trips[0]!.version).toBe(2);
    expect(backend.trips.events.filter((evento) => evento.event_type === 'loading_started')).toHaveLength(1);
  });

  test('sessão expirada no meio de uma operação não grava nada e leva a pessoa a entrar de novo', async ({ page }) => {
    const backend = await entrar(page);
    const { id } = planejar(backend, [['CIL-006']]);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByRole('button', { name: 'Iniciar carregamento' })).toBeEnabled();
    backend.trips.sessionExpired = true;
    await page.getByRole('button', { name: 'Iniciar carregamento' }).click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
    expect(backend.trips.trips[0]!.status).toBe('planned');
    expect(backend.trips.events.filter((evento) => evento.event_type === 'loading_started')).toHaveLength(0);
  });

  test('nada de dado de entrega fica guardado no aparelho depois de uma entrega', async ({ page }) => {
    const backend = await entrar(page);
    const { id, chamar } = planejar(backend, [['CIL-006']], { iniciar: true });
    entregar(backend, id, chamar, 1, RECEBEDOR);
    await page.goto(`/viagens/${id}`);
    await expect(page.getByText(RECEBEDOR)).toBeVisible();
    const guardado = await guardadoNoAparelho(page);
    expect(guardado).not.toContain(RECEBEDOR);
    expect(guardado).not.toContain('CIL-006');
  });
});
