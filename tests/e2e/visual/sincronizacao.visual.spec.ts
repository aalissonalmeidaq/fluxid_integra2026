import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';
import { ORG_A } from '../support/mock-registry';
import { cortarRede, religarRede } from '../support/mock-offline';
import { seedEligibleCylinders } from '../support/mock-trips-plan';

// Linha de base visual da fila offline (Spec 010, US5) em 360, 768 e 1920 px: tela Sincronização (vazia e com um item de cada estado), painel do conflito, indicador
// da barra superior (pendentes, sem conexão e conflito), bloco de fotos (vazio, com fotos e no limite), assinatura (vazia e com traço) e aviso de saída com pendências.
// Só Chromium, e as capturas de referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a renderização da fonte difere por sistema. Nunca
// versione `*-win32.png`. Telas com janela aberta são capturadas na janela (não na página inteira), porque a altura varia com o histórico.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const AGORA = new Date('2026-10-12T15:30:00.000Z');
const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

async function entrar(page: Page): Promise<MockBackend> {
  await page.clock.setFixedTime(AGORA);
  const backend = new MockBackend().asProfile('viagens-admin');
  backend.registry.now = () => AGORA;
  backend.cylinders.now = () => AGORA;
  backend.trips.now = () => AGORA;
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  seedEligibleCylinders(backend.trips);
  await backend.install(page);
  await page.goto('/');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

function planejar(backend: MockBackend, iniciar: boolean) {
  const idDe = (serial: string) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === 'Ana Condutora')!.id,
    stops: [['CIL-006', 'CIL-007']].map((seriais, index) => ({ site_id: backend.registry.sites[index]!.id, cylinder_ids: seriais.map(idDe) })),
  }, () => true);
  const id = String(resposta.json.trip_id);
  const chamar = (operation: string, extra: Record<string, unknown>) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: id, ...extra }, () => true);
  chamar('start_loading', { expected_version: 1 });
  if (iniciar) {
    for (const item of backend.trips.itemsOf(id)) chamar('check_item', { item_id: item.id });
    chamar('start_trip', { expected_version: 2 });
  }
  return { id, chamar };
}

// Guarda a viagem no aparelho (abrindo-a com conexão) e deixa a tela Sincronização já carregada, porque o service worker está bloqueado aqui.
async function guardar(page: Page, id: string): Promise<void> {
  await page.goto(`/viagens/${id}`);
  await expect(page.getByRole('heading', { level: 2, name: /Viagem n\.º/ })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    const total = await new Promise<number>((resolve, reject) => { const p = aberto.transaction('local_trips').objectStore('local_trips').count(); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    aberto.close();
    return total;
  })).toBeGreaterThan(0);
  await page.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('heading', { level: 2, name: 'Sincronização' })).toBeVisible();
  await page.goBack();
}

// Coloca na fila do aparelho um item de cada estado, direto na base local (nada vai ao servidor).
async function semear(page: Page, tripId: string, itemId: string, stopId: string): Promise<void> {
  await page.evaluate(async ({ tripId: viagem, itemId: item, stopId: parada, agora }) => {
    const aberto = await new Promise<IDBDatabase>((resolve, reject) => { const p = indexedDB.open('fluxid-local'); p.onsuccess = () => resolve(p.result); p.onerror = () => reject(p.error); });
    const base = { organization_id: '20000000-0000-0000-0000-00000000000a', actor_id: '10000000-0000-0000-0000-000000000004', device_id: 'aparelho', version: 1, dependencies: [], local_timestamp: agora,
      endpoint_id: 'http://127.0.0.1:54321', trip_id: viagem, server_timestamp: null, attempt_count: 0, failure_reason: null, created_at: agora, updated_at: agora };
    const itens = [
      { ...base, id: 'q1', idempotency_key: 'k1', operation: 'trip.check_item', payload: { trip_id: viagem, item_id: item }, status: 'pending', queued_at: new Date(Date.parse(agora) - 3_600_000).toISOString() },
      { ...base, id: 'q2', idempotency_key: 'k2', operation: 'trip.arrive_stop', payload: { trip_id: viagem, stop_id: parada }, status: 'syncing', queued_at: new Date(Date.parse(agora) - 1_800_000).toISOString() },
      { ...base, id: 'q3', idempotency_key: 'k3', operation: 'trip.check_item', payload: { trip_id: viagem, item_id: item }, status: 'conflict', failure_reason: 'TRIP_CLOSED', queued_at: new Date(Date.parse(agora) - 7_200_000).toISOString() },
      { ...base, id: 'q4', idempotency_key: 'k4', operation: 'trip.deliver', payload: { trip_id: viagem, stop_id: parada }, status: 'failed', failure_reason: 'NETWORK', queued_at: new Date(Date.parse(agora) - 30 * 3_600_000).toISOString() },
    ];
    await new Promise<void>((resolve, reject) => {
      const transacao = aberto.transaction('local_outbox', 'readwrite');
      for (const registro of itens) transacao.objectStore('local_outbox').put(registro);
      transacao.oncomplete = () => resolve();
      transacao.onerror = () => reject(transacao.error);
    });
    aberto.close();
  }, { tripId, itemId, stopId, agora: AGORA.toISOString() });
}

async function capturar(page: Page, nome: string): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page).toHaveScreenshot(nome, { fullPage: false, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

// Foto sem ruído: a captura precisa dar os mesmos bytes a cada rodada.
async function tirarFotoFixa(escopo: ReturnType<Page['locator']>, cor: string): Promise<void> {
  await escopo.locator('input[type="file"][capture]').first().evaluate(async (input, tinta) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const contexto = canvas.getContext('2d')!;
    contexto.fillStyle = tinta;
    contexto.fillRect(0, 0, 320, 240);
    contexto.fillStyle = 'white';
    contexto.fillRect(40, 40, 120, 80);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const transferencia = new DataTransfer();
    transferencia.items.add(new File([blob!], 'camera.jpg', { type: 'image/jpeg' }));
    (input as HTMLInputElement).files = transferencia.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, cor);
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`Fila offline a ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('Sincronização vazia', async ({ page }) => {
      const backend = await entrar(page);
      await page.goto('/sincronizacao');
      await expect(page.getByText('Nada pendente. Tudo foi enviado.')).toBeVisible();
      void backend;
      await capturar(page, `sincronizacao-vazia-${nome}.png`);
    });

    test('Sincronização com pendente, enviando, conflito e falhou (sem conexão, para o envio não mexer nos estados)', async ({ page, context }) => {
      const backend = await entrar(page);
      const viagem = planejar(backend, false);
      await guardar(page, viagem.id);
      await cortarRede(context, page);
      const item = backend.trips.itemsOf(viagem.id)[0]!;
      await semear(page, viagem.id, item.id, item.stop_id);
      await page.evaluate(() => { window.history.pushState(null, '', '/sincronizacao'); window.dispatchEvent(new PopStateEvent('popstate')); });
      await expect(page.getByRole('list', { name: 'Registros da viagem' }).getByRole('listitem')).toHaveCount(4);
      await capturar(page, `sincronizacao-estados-${nome}.png`);
    });

    test('indicador com pendências, sem conexão', async ({ page, context }) => {
      const backend = await entrar(page);
      const viagem = planejar(backend, false);
      await guardar(page, viagem.id);
      await cortarRede(context, page);
      await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
      await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();
      await capturar(page, `sincronizacao-indicador-offline-${nome}.png`);
    });

    test('painel do conflito', async ({ page, context }) => {
      const backend = await entrar(page);
      const viagem = planejar(backend, false);
      await guardar(page, viagem.id);
      await cortarRede(context, page);
      await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
      viagem.chamar('cancel_trip', { expected_version: 2, justification: 'Cancelada pelo despacho' });
      await religarRede(context, page);
      await expect(page.getByRole('button', { name: 'Abrir sincronização: 1 conflito' })).toBeVisible();
      await capturar(page, `sincronizacao-indicador-conflito-${nome}.png`);
      await page.getByRole('button', { name: 'Abrir sincronização: 1 conflito' }).click();
      await page.getByRole('button', { name: /Ver conflito/ }).click();
      await expect(page.getByRole('dialog', { name: 'Conflito na sincronização' })).toBeVisible();
      await capturar(page, `sincronizacao-conflito-${nome}.png`);
    });

    test('aviso de saída com pendências', async ({ page, context }) => {
      const backend = await entrar(page);
      const viagem = planejar(backend, false);
      await guardar(page, viagem.id);
      await cortarRede(context, page);
      await page.getByRole('button', { name: 'Conferir CIL-006' }).click();
      await expect(page.getByRole('button', { name: 'Abrir sincronização: Sem conexão, 1 pendente' })).toBeVisible();
      await page.getByRole('button', { name: 'Minha conta' }).click();
      await page.getByRole('button', { name: 'Sair' }).click();
      await expect(page.getByRole('dialog', { name: 'Há registros que ainda não foram enviados' })).toBeVisible();
      await capturar(page, `sincronizacao-saida-${nome}.png`);
    });

    test('fotos da entrega: vazio, com fotos e no limite; assinatura vazia e com traço', async ({ page }) => {
      const backend = await entrar(page);
      const viagem = planejar(backend, true);
      await page.goto(`/viagens/${viagem.id}`);
      await page.getByRole('button', { name: /Registrar chegada à parada 1/ }).click();
      await expect(page.getByText(/Situação da parada: No local/)).toBeVisible();
      await page.getByRole('button', { name: 'Registrar entrega da parada 1' }).click();
      const dialogo = page.getByRole('dialog', { name: 'Registrar entrega · Parada 1' });
      const fotos = dialogo.getByRole('group', { name: 'Fotos da entrega (opcional)' });
      await fotos.scrollIntoViewIfNeeded();
      await capturar(page, `anexos-fotos-vazio-${nome}.png`);
      await tirarFotoFixa(dialogo, 'steelblue');
      await expect(dialogo.getByText('1 de 3')).toBeVisible();
      await tirarFotoFixa(dialogo, 'seagreen');
      await expect(dialogo.getByText('2 de 3')).toBeVisible();
      await fotos.scrollIntoViewIfNeeded();
      await capturar(page, `anexos-fotos-duas-${nome}.png`);
      await tirarFotoFixa(dialogo, 'goldenrod');
      await expect(dialogo.getByText('3 de 3')).toBeVisible();
      await fotos.scrollIntoViewIfNeeded();
      await capturar(page, `anexos-fotos-limite-${nome}.png`);
      const assinatura = dialogo.getByRole('group', { name: 'Assinatura de quem recebeu (opcional)' });
      await assinatura.scrollIntoViewIfNeeded();
      await capturar(page, `anexos-assinatura-vazia-${nome}.png`);
      const area = dialogo.getByLabel('Área de assinatura. Opcional; a entrega pode ser concluída sem assinatura.');
      const caixa = (await area.boundingBox())!;
      await page.mouse.move(caixa.x + caixa.width * 0.15, caixa.y + caixa.height * 0.5);
      await page.mouse.down();
      for (let passo = 1; passo <= 12; passo += 1) await page.mouse.move(caixa.x + caixa.width * (0.15 + passo * 0.06), caixa.y + caixa.height * (0.5 + Math.sin(passo) * 0.25), { steps: 2 });
      await page.mouse.up();
      await expect(dialogo.getByRole('button', { name: 'Limpar assinatura' })).toBeEnabled();
      await assinatura.scrollIntoViewIfNeeded();
      await capturar(page, `anexos-assinatura-traco-${nome}.png`);
    });
  });
}
