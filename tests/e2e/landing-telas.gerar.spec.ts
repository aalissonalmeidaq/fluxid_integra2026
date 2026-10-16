import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { assinar, NOMES, POSICAO_DA_PRIMEIRA_UNIDADE, tornarApresentavel } from './support/massa-apresentavel';
import { MockBackend } from './support/mock-backend';
import { ORG_A } from './support/mock-registry';
import { seedEligibleCylinders } from './support/mock-trips-plan';

// Gerador das capturas de tela da landing page (Spec 011). NÃO faz parte da suíte: só roda quando se pede, com
//   GERAR_TELAS_LANDING=1 npx playwright test tests/e2e/landing-telas.gerar.spec.ts --project=desktop-chromium
// Abre o aplicativo compilado com o backend simulado (dados fictícios, os mesmos das capturas visuais) e grava, em public/landing/telas/, a
// viagem em andamento no desktop e a mesma viagem no celular de campo, em WebP. Nenhum dado real: todos os nomes, códigos e placas do
// simulado são fictícios. Refaça quando a interface mudar, para a página mostrar o produto como ele está.
const SAIDA = join(import.meta.dirname, '..', '..', 'public', 'landing', 'telas');
const AGORA = new Date('2026-10-12T15:30:00.000Z');

async function abrirSessao(browser: Browser, viewport: { width: number; height: number }, escala: number): Promise<{ page: Page; viagem: string }> {
  const contexto = await browser.newContext({ viewport, deviceScaleFactor: escala, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await contexto.newPage();
  await page.clock.setFixedTime(AGORA);
  const backend = new MockBackend().asProfile('viagens-admin');
  backend.registry.now = () => AGORA;
  backend.cylinders.now = () => AGORA;
  backend.trips.now = () => AGORA;
  // Nomes fictícios apresentáveis (organização, clientes, motorista e quem fez cada ação): os nomes de teste do simulado não vão a público.
  tornarApresentavel(backend);
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  seedEligibleCylinders(backend.trips);

  // Viagem em andamento com duas paradas, a mesma das capturas visuais do aplicativo de campo.
  const idDe = (serial: string) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === NOMES.motoristas['Ana Condutora'])!.id,
    stops: [['CIL-006'], ['CIL-007']].map((seriais, index) => ({ site_id: backend.registry.sites[index]!.id, cylinder_ids: seriais.map(idDe) })),
  }, () => true);
  const viagem = String(resposta.json.trip_id);
  const chamar = (operation: string, extra: Record<string, unknown>) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: viagem, ...extra }, () => true);
  chamar('start_loading', { expected_version: 1 });
  for (const item of backend.trips.itemsOf(viagem)) chamar('check_item', { item_id: item.id });
  chamar('start_trip', { expected_version: 2 });
  assinar(backend, NOMES.integrante.nome);
  // A parada 1 já foi entregue, com recebedor e posição: o momento que a landing quer mostrar (a entrega com evidência).
  const parada = backend.trips.stopsOf(viagem).find((item) => item.position === 1)!;
  chamar('arrive_stop', { stop_id: parada.id, arrived_at: new Date(AGORA.getTime() - 25 * 60_000).toISOString(), latitude: POSICAO_DA_PRIMEIRA_UNIDADE.latitude, longitude: POSICAO_DA_PRIMEIRA_UNIDADE.longitude, accuracy_m: 12, position_source: 'gps' });
  chamar('register_delivery', {
    stop_id: parada.id, delivered_at: new Date(AGORA.getTime() - 15 * 60_000).toISOString(), recipient_name: 'Juliana Prado', recipient_role: 'Enfermeira',
    latitude: POSICAO_DA_PRIMEIRA_UNIDADE.latitude, longitude: POSICAO_DA_PRIMEIRA_UNIDADE.longitude, accuracy_m: 12, position_source: 'gps',
    results: backend.trips.itemsOf(viagem).filter((item) => item.stop_id === parada.id).map((item) => ({ item_id: item.id, delivered: true })),
  });
  assinar(backend, NOMES.motoristas['Ana Condutora']!);

  await backend.install(page);
  await page.goto('/visao-geral');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return { page, viagem };
}

// PNG da tela para WebP, pelo próprio Chromium (sem dependência nova).
async function paraWebp(page: Page, png: Buffer): Promise<Buffer> {
  const conversor = await page.context().newPage();
  try {
    await conversor.setContent('<canvas></canvas>');
    const base64 = await conversor.evaluate(async (dados) => {
      const imagem = new Image();
      imagem.src = `data:image/png;base64,${dados}`;
      await imagem.decode();
      const tela = document.querySelector('canvas')!;
      tela.width = imagem.naturalWidth;
      tela.height = imagem.naturalHeight;
      tela.getContext('2d')!.drawImage(imagem, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => tela.toBlob(resolve, 'image/webp', 0.86));
      const bytes = new Uint8Array(await blob!.arrayBuffer());
      let texto = '';
      for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(texto);
    }, png.toString('base64'));
    return Buffer.from(base64, 'base64');
  } finally {
    await conversor.close();
  }
}

async function capturar(page: Page, arquivo: string, recorte?: { x: number; y: number; width: number; height: number }): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  const webp = await paraWebp(page, await page.screenshot({ type: 'png', caret: 'hide', animations: 'disabled', ...(recorte ? { clip: recorte } : {}) }));
  writeFileSync(join(SAIDA, arquivo), webp);
  console.log(`${arquivo}: ${(webp.length / 1024).toFixed(1)} KB`);
}

test.describe('Capturas de tela da landing (sob demanda)', () => {
  test.skip(process.env.GERAR_TELAS_LANDING !== '1', 'Só roda quando se pede (GERAR_TELAS_LANDING=1).');

  test('viagem no desktop e no celular de campo', async ({ browser }) => {
    test.setTimeout(180_000);
    mkdirSync(SAIDA, { recursive: true });

    // Área da viagem em 16:10 (a tela do notebook do mockup), com densidade 1,5: a imagem sai em 1920 x 1200 e fica nítida ampliada.
    const desktop = await abrirSessao(browser, { width: 1536, height: 800 }, 1.5);
    await desktop.page.goto(`/viagens/${desktop.viagem}`);
    await expect(desktop.page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    // Como no celular, a captura começa em "Paradas e carga": é o que prova a conferência e a entrega, e deixa de fora o topo da tela, com o
    // aviso técnico do bloqueio lógico e o rótulo do modo de conexão de desenvolvimento ("Dispositivo local").
    const paradasDesktop = desktop.page.getByRole('heading', { name: 'Paradas e carga' });
    await expect(paradasDesktop).toBeVisible();
    await paradasDesktop.evaluate((elemento) => elemento.scrollIntoView({ block: 'start' }));
    // Recorte só da área da viagem (sem a coluna do menu, que rola junto e fica vazia nesta posição).
    await capturar(desktop.page, 'tela-viagem-desktop.webp', { x: 256, y: 0, width: 1280, height: 800 });
    await desktop.page.context().close();

    const celular = await abrirSessao(browser, { width: 390, height: 844 }, 2);
    await celular.page.goto(`/viagens/${celular.viagem}`);
    // No celular o que mostra o aplicativo de campo são as paradas e a carga: rola até elas.
    const paradas = celular.page.getByRole('heading', { name: 'Paradas e carga' });
    await expect(paradas).toBeVisible();
    await paradas.evaluate((elemento) => elemento.scrollIntoView({ block: 'start' }));
    await capturar(celular.page, 'tela-campo-celular.webp');
    await celular.page.context().close();
  });
});
