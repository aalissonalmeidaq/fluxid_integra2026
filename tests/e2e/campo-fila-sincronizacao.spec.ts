import { test, expect } from '@playwright/test';
import { cortarRede, lerFila, religarRede } from './support/mock-offline';
import { resolutions } from './support/mock-trips-offline';
import { entrar, planejar } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 010, US2 (RF-008 a RF-017, CA-002, CA-006, MS-001, MS-003): ao voltar a conexão a fila é enviada em ordem, sem duplicar; o conflito fica preservado e
// visível; descartar exige conexão e justificativa; reenviar devolve o item à fila.
async function guardarViagem(page: import('@playwright/test').Page, id: string): Promise<void> {
  await page.goto(`/viagens/${id}`);
  await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
  await expect.poll(() => page.evaluate(async () => {
    const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    const total = await new Promise<number>((resolve, reject) => { const p = aberto.transaction('local_trips').objectStore('local_trips').count(); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    aberto.close();
    return total;
  })).toBe(1);
  // A tela Sincronização é carregada sob demanda; com o service worker bloqueado aqui, ela precisa já estar carregada quando a rede cair.
  await page.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Conferir CIL-006' })).toBeEnabled();
}

test.describe('envio da fila ao voltar a conexão', () => {
  test('envia em ordem, uma vez cada, e o indicador some', async ({ page, context }) => {
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await guardarViagem(page, carregando.id);

    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await page.getByRole('button', { name: 'Conferir CIL-007' }).click();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 2 pendentes' })).toBeVisible();
    expect(backend.trips.itemsOf(carregando.id).filter((item) => item.item_status === 'checked')).toHaveLength(0);

    await religarRede(context, page);
    await expect.poll(() => backend.trips.itemsOf(carregando.id).filter((item) => item.item_status === 'checked').length).toBe(2);
    // Cada operação chegou uma vez, com a hora do aparelho, e a fila esvaziou.
    expect(backend.trips.syncEvents.filter((event) => event.outcome === 'applied')).toHaveLength(2);
    expect(backend.trips.syncEvents.every((event) => event.queuedAt.length > 0)).toBe(true);
    await expect.poll(async () => (await lerFila(page)).length).toBe(0);
    await expect(page.getByRole('button', { name: /Abrir sincronização/ })).toHaveCount(0);
    expect(backend.trips.events.filter((event) => event.event_type === 'item_checked')).toHaveLength(2);
  });

  test('queda no meio do envio: o reenvio não duplica', async ({ page, context }) => {
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await guardarViagem(page, carregando.id);

    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();
    // O servidor grava, mas a resposta se perde: o aparelho não sabe e reenvia com a mesma chave.
    backend.trips.loseNextCommandResponse = true;
    await religarRede(context, page);
    await expect.poll(() => backend.trips.itemsOf(carregando.id).filter((item) => item.item_status === 'checked').length).toBe(1);
    // A resposta se perdeu: o item continua na fila e o reenvio (aqui, "Enviar agora") devolve o mesmo resultado, sem duplicar.
    await expect(page.getByRole('button', { name: /Abrir sincronização/ })).toBeVisible();
    await page.getByRole('button', { name: /Abrir sincronização/ }).click();
    await page.getByRole('button', { name: 'Enviar agora' }).click();
    await expect.poll(async () => (await lerFila(page)).length).toBe(0);
    expect(backend.trips.itemsOf(carregando.id).filter((item) => item.item_status === 'checked')).toHaveLength(1);
    expect(backend.trips.events.filter((event) => event.event_type === 'item_checked')).toHaveLength(1);
    expect(backend.trips.syncEvents.map((event) => event.outcome)).toContain('replayed');
  });
});

test.describe('conflito', () => {
  test('viagem cancelada por outra sessão: o conflito fica visível, e descartar exige a justificativa', async ({ page, context }) => {
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await guardarViagem(page, carregando.id);

    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();
    expect(carregando.chamar('cancel_trip', { expected_version: 2, justification: 'Cancelada pelo despacho' }).status).toBe(200);

    await religarRede(context, page);
    const indicador = page.getByRole('button', { name: 'Abrir sincronização: 1 conflito' });
    await expect(indicador).toBeVisible();
    // A fila preserva o registro; nada foi aplicado no servidor.
    expect((await lerFila(page)).map((item) => item.status)).toEqual(['conflict']);
    await indicador.click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
    await page.getByRole('button', { name: /Ver conflito/ }).click();
    const painel = page.getByRole('dialog', { name: 'Conflito na sincronização' });
    await expect(painel.getByText('A viagem foi encerrada depois que você registrou isto.')).toBeVisible();

    await painel.getByRole('button', { name: 'Descartar' }).click();
    await painel.getByLabel('Justificativa').fill('abc');
    await painel.getByRole('button', { name: 'Descartar registro' }).click();
    await expect(painel.getByText('A justificativa deve ter de 5 a 500 caracteres.')).toBeVisible();
    expect(resolutions).toHaveLength(0);
    await painel.getByLabel('Justificativa').fill('Viagem cancelada, registro sem efeito');
    await painel.getByRole('button', { name: 'Descartar registro' }).click();
    await expect(painel).toHaveCount(0);
    await expect.poll(async () => (await lerFila(page)).length).toBe(0);
    expect(resolutions.at(-1)).toMatchObject({ decision: 'discard', hasJustification: true });
    await expect(page.getByText('Nada pendente. Tudo foi enviado.')).toBeVisible();
  });

  test('descartar sem conexão fica desabilitado, com o motivo', async ({ page, context }) => {
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await guardarViagem(page, carregando.id);
    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    carregando.chamar('cancel_trip', { expected_version: 2, justification: 'Cancelada pelo despacho' });
    await religarRede(context, page);
    await page.getByRole('button', { name: 'Abrir sincronização: 1 conflito' }).click();
    await page.getByRole('button', { name: /Ver conflito/ }).click();
    const painel = page.getByRole('dialog', { name: 'Conflito na sincronização' });
    await cortarRede(context, page);
    await expect(painel.getByRole('button', { name: 'Descartar' })).toBeDisabled();
    await expect(painel.getByText('Exige conexão: a decisão fica registrada no servidor.')).toBeVisible();
  });
});

test.describe('sair e trocar de conta', () => {
  test('sair com pendências avisa, e "sair mesmo assim" mantém a fila no aparelho', async ({ page, context }) => {
    const backend = await entrar(page);
    const carregando = planejar(backend, [['CIL-006', 'CIL-007']]);
    carregando.chamar('start_loading', { expected_version: 1 });
    await guardarViagem(page, carregando.id);
    await cortarRede(context, page);
    await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
    await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();

    await page.getByRole('button', { name: 'Minha conta' }).click();
    await page.getByRole('button', { name: 'Sair' }).click();
    const aviso = page.getByRole('dialog', { name: 'Há registros que ainda não foram enviados' });
    await expect(aviso.getByText(/Há 1 operação que ainda não foi enviada/)).toBeVisible();
    await expect(aviso.getByRole('button', { name: 'Enviar antes de sair' })).toBeDisabled();
    await aviso.getByRole('button', { name: 'Continuar no aplicativo' }).click();
    await expect(aviso).toHaveCount(0);
    expect(await lerFila(page)).toHaveLength(1);
  });
});
