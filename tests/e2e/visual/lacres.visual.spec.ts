import { test, expect, type Page } from '@playwright/test';
import { MockBackend } from '../support/mock-backend';
import { ORG_A } from '../support/mock-registry';
import { abrirAlerta, lacreVinculado, novoDispositivo, registrarPosicoes } from '../support/mock-seals-operacoes';

// Linha de base visual das telas dos lacres (Spec 012, T117) em 360, 768 e 1920 px: lista e detalhe do dispositivo (com as redes
// Wi-Fi), o bloco "Lacre" no detalhe do cilindro, a lista e o detalhe do alerta, e o diálogo de adicionar rede. Só Chromium, com as
// capturas de referência geradas no Linux (npm run test:visual:atualizar). Nunca versione `*-win32.png`.
test.use({ serviceWorkers: 'block', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

const AGORA = new Date('2026-10-17T14:10:00.000Z');
const LARGURAS = [
  { nome: '360', largura: 360, altura: 740 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

interface Cenario { cilindro: string; lacre: string; alerta: string }

async function entrar(page: Page): Promise<Cenario> {
  await page.clock.setFixedTime(AGORA);
  const backend = new MockBackend().asProfile('lacres-admin');
  backend.registry.now = () => AGORA;
  backend.cylinders.now = () => AGORA;
  backend.seals.now = () => AGORA;
  for (const evento of backend.registry.events) evento.occurred_at = '2026-10-01T10:00:00.000Z';
  const cil = backend.cylinders.cylinders.find((c) => c.organization_id === ORG_A && c.serial_number === 'CIL-006')!;
  const lacre = lacreVinculado(backend.seals, ORG_A, cil.id, 'CIL-006', 'Lacre do pátio', {
    lock_state: 'locked', wifi_saved: ['Rede-Deposito', 'Rede-Caminhao-02'],
    wifi_in_use: { ssid: 'Rede-Deposito', kind: 'list', rssi: -58, at: '2026-10-17T14:09:00.000Z' },
  });
  registrarPosicoes(backend.seals, ORG_A, lacre, cil.id, 3);
  // A geocerca esperada (vigilância) com o lacre dentro, e uma próxima, fora.
  backend.seals.rows('geofence_views').push({
    device_id: lacre.device_id, expected_reason: 'watch', expected_site_name: 'Unidade Centro',
    geofences: [
      { id: 'g1', name: 'Pátio da Unidade Centro', site_name: 'Unidade Centro', expected: true, shape: 'circle', center: { latitude: -7.209194, longitude: -39.306367 }, radius_m: 150, vertices: null, inside: true, distance_m: 0 },
      { id: 'g2', name: 'Depósito Norte', site_name: 'Depósito', expected: false, shape: 'polygon', center: null, radius_m: null,
        vertices: [{ latitude: -7.2035, longitude: -39.3035 }, { latitude: -7.2035, longitude: -39.3015 }, { latitude: -7.2020, longitude: -39.3015 }, { latitude: -7.2020, longitude: -39.3035 }], inside: false, distance_m: 640 },
    ],
  });
  const semCilindro = novoDispositivo(backend.seals, ORG_A, 'Lacre reserva');
  const alerta = abrirAlerta(backend.seals, ORG_A, lacre, 'possible_loss', 'critical', { cylinder_id: cil.id });
  abrirAlerta(backend.seals, ORG_A, semCilindro, 'low_battery', 'medium', { status: 'acknowledged', acknowledged_at: '2026-10-17T14:00:00.000Z' });

  backend.loginResponses = [backend.authenticated()];
  backend.statusResponse = backend.activeStatus('aal2');
  await backend.install(page);
  await page.goto('/visao-geral');
  await page.getByLabel('E-mail').fill('admin-a@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible();
  return { cilindro: cil.id, lacre: String(lacre.device_id), alerta: String(alerta.id) };
}

async function capturar(page: Page, nome: string, paginaInteira = true): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(async () => { await document.fonts.ready; });
  await expect(page).toHaveScreenshot(nome, { fullPage: paginaInteira, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
}

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`lacres em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    test('lista de lacres', async ({ page }) => {
      await entrar(page);
      await page.goto('/lacres');
      await expect(page.getByText('Lacre reserva').first()).toBeVisible();
      await capturar(page, `lacres-lista-${nome}.png`);
    });

    test('detalhe do lacre com as redes Wi-Fi', async ({ page }) => {
      const { lacre } = await entrar(page);
      await page.goto(`/lacres/${lacre}`);
      await expect(page.getByRole('list', { name: 'Redes guardadas' })).toBeVisible();
      await capturar(page, `lacres-detalhe-${nome}.png`);
    });

    test('diálogo de adicionar rede', async ({ page }) => {
      const { lacre } = await entrar(page);
      await page.goto(`/lacres/${lacre}`);
      await page.getByRole('button', { name: 'Adicionar rede' }).click();
      await expect(page.getByRole('dialog', { name: 'Adicionar rede Wi-Fi' })).toBeVisible();
      await capturar(page, `lacres-dialogo-rede-${nome}.png`, false);
    });

    test('bloco do lacre no cilindro', async ({ page }) => {
      const { cilindro } = await entrar(page);
      await page.goto(`/cilindros/${cilindro}`);
      const bloco = page.getByRole('region', { name: 'Lacre' });
      await expect(bloco.getByText('Funcionando')).toBeVisible();
      await bloco.getByRole('button', { name: 'Ver as posições em texto' }).click();
      await expect(bloco.getByRole('button', { name: 'Ocultar as posições em texto' })).toBeVisible();
      await bloco.scrollIntoViewIfNeeded();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await page.evaluate(async () => { await document.fonts.ready; });
      await expect(bloco).toHaveScreenshot(`lacres-bloco-cilindro-${nome}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
    });

    test('lista de alertas', async ({ page }) => {
      await entrar(page);
      await page.goto('/alertas');
      await expect(page.getByRole('list', { name: 'Lista de alertas' })).toBeVisible();
      await capturar(page, `lacres-alertas-${nome}.png`);
    });

    test('detalhe do alerta', async ({ page }) => {
      const { alerta } = await entrar(page);
      await page.goto(`/alertas/${alerta}`);
      await expect(page.getByRole('heading', { level: 2, name: 'Possível extravio' })).toBeVisible();
      await capturar(page, `lacres-alerta-detalhe-${nome}.png`);
    });
  });
}
