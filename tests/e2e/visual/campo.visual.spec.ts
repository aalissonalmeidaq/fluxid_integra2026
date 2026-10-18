import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';
import { installFieldReaders } from '../support/mock-field-reading';
import { allowLocation, denyLocation } from '../support/mock-geolocation';
import { ORG_A } from '../support/mock-registry';
import { seedEligibleCylinders } from '../support/mock-trips-plan';

// Linha de base visual do aplicativo de campo (Spec 009, US4) em 360, 768 e 1920 px: janela de leitura (aberta e com a câmera negada),
// bloco de posição (vazio, lida, precisão ruim, fora da geocerca e erro) e o botão "Ler cilindro". Só Chromium, e as capturas de
// referência são geradas no Linux (contêiner oficial do Playwright ou CI), porque a renderização da fonte difere por sistema. Nunca
// versione `*-win32.png`. Veja specs/003-design-system-telas/quickstart.md.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const AGORA = new Date('2026-10-12T15:30:00.000Z');
const DIA_DAS_CAPTURAS = '2026-10-13';
const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

const DENTRO = { latitude: -23.55, longitude: -46.633, accuracy: 12 };

async function entrar(page: Page, opcoes: { camera?: boolean; nfc?: boolean; cameraNegada?: boolean } = { camera: true, nfc: true }): Promise<MockBackend> {
  await page.clock.setFixedTime(AGORA);
  await installFieldReaders(page, opcoes);
  if (opcoes.cameraNegada) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) },
      });
    });
  }
  const backend = new MockBackend().asProfile('viagens-admin');
  // A massa nasce relativa a "hoje": ancora as validades no dia em que as capturas foram geradas, para elas não mudarem com o calendário.
  backend.registry.ancorarValidadesEm(DIA_DAS_CAPTURAS);
  backend.registry.now = () => AGORA;
  backend.cylinders.now = () => AGORA;
  backend.trips.now = () => AGORA;
  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  seedEligibleCylinders(backend.trips);
  await backend.install(page);
  await page.goto('/visao-geral');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return backend;
}

// Planeja, carrega, confere tudo e inicia direto no simulado e devolve a viagem em andamento.
function emAndamento(backend: MockBackend): string {
  const idDe = (serial: string) => backend.cylinders.cylinders.find((c) => c.serial_number === serial)!.id;
  const resposta = backend.trips.handle('manage', {
    operation: 'create_trip', organization_id: ORG_A, request_id: crypto.randomUUID(), planned_date: backend.trips.today(),
    vehicle_id: backend.registry.vehicles.find((v) => v.plate === 'ABC1234')!.id, driver_id: backend.registry.drivers.find((d) => d.full_name === 'Ana Condutora')!.id,
    stops: [['CIL-006'], ['CIL-007']].map((seriais, index) => ({ site_id: backend.registry.sites[index]!.id, cylinder_ids: seriais.map(idDe) })),
  }, () => true);
  const id = String(resposta.json.trip_id);
  const chamar = (operation: string, extra: Record<string, unknown>) => backend.trips.handle('manage', { operation, organization_id: ORG_A, request_id: crypto.randomUUID(), trip_id: id, ...extra }, () => true);
  chamar('start_loading', { expected_version: 1 });
  for (const item of backend.trips.itemsOf(id)) chamar('check_item', { item_id: item.id });
  chamar('start_trip', { expected_version: 2 });
  backend.registry.geofences.push({
    id: 'g1', organization_id: ORG_A, site_id: backend.registry.sites[0]!.id, name: 'Cerca', shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radius_m: 200, vertices: [], status: 'active', version: 1,
  });
  return id;
}

// Telas com janela aberta são capturadas na janela, como a pessoa vê.
async function capturar(page: Page, nome: string, paginaInteira = false): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  // Rola o bloco de posição (se houver) para a vista: a janela inteira é estável; a página inteira muda de altura com o histórico.
  const botaoPosicao = page.getByRole('button', { name: /Usar minha posição|Tentar de novo/ });
  if (await botaoPosicao.count() > 0) await botaoPosicao.first().scrollIntoViewIfNeeded();
  await expect(page).toHaveScreenshot(nome, { fullPage: paginaInteira, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

async function abrirChegada(page: Page, id: string): Promise<void> {
  await page.goto(`/viagens/${id}`);
  await page.getByRole('button', { name: /Chegada com a posição da parada 1/ }).click();
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`Aplicativo de campo a ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('janela de leitura aberta, com a câmera', async ({ page }) => {
      await entrar(page);
      await page.goto('/cilindros');
      await page.getByRole('button', { name: 'Ler cilindro' }).click();
      await expect(page.getByRole('dialog', { name: 'Ler cilindro' })).toBeVisible();
      await capturar(page, `campo-leitor-aberto-${nome}.png`);
    });

    test('janela de leitura com a câmera negada', async ({ page }) => {
      await entrar(page, { camera: true, nfc: false, cameraNegada: true });
      await page.goto('/cilindros');
      await page.getByRole('button', { name: 'Ler cilindro' }).click();
      await expect(page.getByRole('dialog', { name: 'Ler cilindro' })).toBeVisible();
      await expect(page.getByText(/câmera/i).first()).toBeVisible();
      await capturar(page, `campo-leitor-negado-${nome}.png`);
    });

    test('botão "Ler cilindro" na lista de cilindros', async ({ page }) => {
      await entrar(page);
      await page.goto('/cilindros');
      await expect(page.getByRole('button', { name: 'Ler cilindro' })).toBeVisible();
      await capturar(page, `campo-ler-cilindro-${nome}.png`);
    });

    test('bloco de posição vazio', async ({ page }) => {
      const backend = await entrar(page);
      await abrirChegada(page, emAndamento(backend));
      await expect(page.getByRole('button', { name: 'Usar minha posição' })).toBeVisible();
      await capturar(page, `campo-posicao-vazia-${nome}.png`);
    });

    test('bloco de posição com a posição lida', async ({ page }) => {
      const backend = await entrar(page);
      const id = emAndamento(backend);
      await allowLocation(page, DENTRO);
      await abrirChegada(page, id);
      await page.getByRole('button', { name: 'Usar minha posição' }).click();
      await expect(page.getByText('Origem: GPS')).toBeVisible();
      await capturar(page, `campo-posicao-lida-${nome}.png`);
    });

    test('bloco de posição com precisão ruim', async ({ page }) => {
      const backend = await entrar(page);
      const id = emAndamento(backend);
      await allowLocation(page, { ...DENTRO, accuracy: 450 });
      await abrirChegada(page, id);
      await page.getByRole('button', { name: 'Usar minha posição' }).click();
      await expect(page.getByText('Precisão baixa (cerca de 450 m). Você pode salvar mesmo assim.')).toBeVisible();
      await capturar(page, `campo-posicao-precisao-ruim-${nome}.png`);
    });

    test('bloco de posição fora da geocerca', async ({ page }) => {
      const backend = await entrar(page);
      const id = emAndamento(backend);
      await allowLocation(page, { latitude: -23.5, longitude: -46.6, accuracy: 12 });
      await abrirChegada(page, id);
      await page.getByRole('button', { name: 'Usar minha posição' }).click();
      await expect(page.getByText('Origem: GPS')).toBeVisible();
      await capturar(page, `campo-posicao-fora-da-cerca-${nome}.png`);
    });

    test('bloco de posição com erro (permissão negada)', async ({ page }) => {
      const backend = await entrar(page);
      const id = emAndamento(backend);
      await denyLocation(page);
      await abrirChegada(page, id);
      await page.getByRole('button', { name: 'Usar minha posição' }).click();
      await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
      await capturar(page, `campo-posicao-erro-${nome}.png`);
    });
  });
}
