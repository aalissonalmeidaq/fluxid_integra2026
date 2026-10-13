import { test, expect } from '@playwright/test';
import { cortarRede, lerFila } from './support/mock-offline';
import { entrar, planejar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 010, US1 (RF-001 a RF-007, CA-005, MS-001): com a viagem guardada no aparelho, a pessoa confere, chega e entrega sem conexão; tudo fica
// "pendente de envio", nada chega ao servidor e a fila é gravada no aparelho. Ações que exigem conexão ficam desabilitadas com o motivo.
const LARGURAS = [360, 768, 1920] as const;

for (const largura of LARGURAS) {
  test.describe(`largura ${largura} px`, () => {
    test.use({ viewport: { width: largura, height: 900 } });

    test('conferência sem conexão: os 4 cilindros ficam pendentes, o indicador conta, nada chega ao servidor e desfazer pendente sai da fila', async ({ page, context }) => {
      const backend = await entrar(page);
      const carregando = planejar(backend, [['CIL-006', 'CIL-007'], ['CIL-008', 'CIL-009']]);
      carregando.chamar('start_loading', { expected_version: 1 });
      await page.goto(`/viagens/${carregando.id}`);
      await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
      // A cópia da viagem é guardada ao abri-la com conexão; só depois a rede cai.
      await expect.poll(async () => (await page.evaluate(async () => {
        const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
        const total = await new Promise<number>((resolve, reject) => { const p = aberto.transaction('local_trips').objectStore('local_trips').count(); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
        aberto.close();
        return total;
      }))).toBe(1);

      // Com o service worker bloqueado aqui, a tela Sincronização (carregada sob demanda) precisa já estar carregada quando a rede cair; no
      // aplicativo instalado ela vem do precache.
      await page.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();

      const pedidos = backend.trips.receivedRequestIds.length;
      await cortarRede(context, page);
      await expect(page.getByText('Sem conexão. O que você registrar fica neste aparelho e será enviado quando houver conexão.')).toBeVisible();
      for (const serie of ['CIL-006', 'CIL-007', 'CIL-008', 'CIL-009']) await page.getByRole('button', { name: `Conferir ${serie}` }).click();
      await expect(page.getByText('4 de 4 conferidos').first()).toBeVisible();
      await expect(page.getByText('Conferido, pendente de envio').first()).toBeVisible();

      // O indicador da barra superior conta o que está pendente, e nada chegou ao servidor.
      await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 4 pendentes' })).toBeVisible();
      expect(backend.trips.receivedRequestIds).toHaveLength(pedidos);
      expect(backend.trips.itemsOf(carregando.id).filter((item) => item.item_status === 'checked')).toHaveLength(0);
      expect(await lerFila(page)).toHaveLength(4);

      // Ações que exigem conexão ficam desabilitadas, com o motivo.
      await expect(page.getByRole('button', { name: 'Iniciar viagem' })).toBeDisabled();
      await expect(page.getByText('Esta operação exige conexão.')).toBeVisible();

      // A tela Sincronização lista os quatro registros e a fila continua depois de sair e voltar (a leitura vem do aparelho).
      await page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 4 pendentes' }).click();
      await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Registros da viagem' }).getByRole('listitem')).toHaveCount(4);
      await page.goBack();
      await expect(page.getByText('Conferido, pendente de envio').first()).toBeVisible();

      // Desfazer um pendente que nunca saiu do aparelho o tira da fila, sem evento no servidor.
      await page.getByRole('button', { name: 'Desfazer a conferência de CIL-006' }).click();
      await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 3 pendentes' })).toBeVisible();
      expect(await lerFila(page)).toHaveLength(3);
      expect(backend.trips.receivedRequestIds).toHaveLength(pedidos);
    });
  });
}

test.describe('chegada e entrega sem conexão', () => {
  test('chega e entrega a parada 1 offline: tudo pendente, sem recebedor fora da fila e nada no servidor', async ({ page, context }) => {
    const backend = await entrar(page);
    const andamento = planejar(backend, [['CIL-006', 'CIL-007'], ['CIL-008']], { iniciar: true });
    await page.goto(`/viagens/${andamento.id}`);
    await expect(page.getByText('Situação da viagem: Em andamento')).toBeVisible();
    await expect(page.getByRole('button', { name: /Registrar chegada à parada 1/ })).toBeEnabled();
    await expect.poll(async () => page.evaluate(async () => (await indexedDB.databases()).some((banco) => banco.name === 'fluxid-local'))).toBe(true);
    await page.waitForTimeout(500);

    const pedidos = backend.trips.receivedRequestIds.length;
    await cortarRede(context, page);
    await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
    await expect(page.getByText('No local, pendente de envio')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    await dialogo.getByLabel('Nome de quem recebeu').fill('Recebedor Fictício');
    await dialogo.getByLabel('Latitude').fill('-23,5505');
    await dialogo.getByLabel('Longitude').fill('-46,6333');
    await dialogo.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByText('Situação da parada: Entregue, pendente de envio')).toBeVisible();

    const fila = await lerFila(page);
    expect(fila.map((item) => item.operation).sort()).toEqual(['trip.arrive_stop', 'trip.deliver']);
    expect(backend.trips.receivedRequestIds).toHaveLength(pedidos);
    expect(backend.trips.stopsOf(andamento.id).find((parada) => parada.position === 1)!.status).toBe('pending');
    // Corrigir a entrega exige conexão: sem o registro confirmado pelo servidor, o botão nem aparece.
    await expect(page.getByRole('button', { name: 'Corrigir a entrega da parada 1' })).toHaveCount(0);
  });
});
