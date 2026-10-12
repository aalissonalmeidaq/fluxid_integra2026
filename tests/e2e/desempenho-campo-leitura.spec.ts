import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { installFieldReaders, type FieldReaders } from './support/mock-field-reading';

// Spec 009, RNF-001 e RNF-002: do código reconhecido até o cilindro conferido na tela, até 1 s (p95), e a leitura de posição em até
// 15 s sem travar a tela, em conexão 4G. Roda só com E2E_AO_VIVO=1 (npm run test:desempenho:campo), contra o Supabase local real e as
// funções carregadas, com a rede no perfil "Slow 4G" (150 ms de latência, 1,6 Mbps de descida e 750 kbps de subida). A câmera e o GPS são
// simulados: o que se mede é a rede, o servidor (`resolve` e `check_item`) e a renderização. A latência da câmera real fica para o aparelho.
const SEMENTE = join(import.meta.dirname, '..', 'support', 'tmp', 'campo-medicao.json');
const LIMITE_CONFERENCIA_MS = 1000;
const LIMITE_POSICAO_MS = 15_000;

const percentil = (valores: number[], p: number): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)] ?? 0;
};

test.describe('Leitura de campo em 4G', () => {
  test.describe.configure({ mode: 'serial' });
  let context: BrowserContext;
  let page: Page;
  let readers: FieldReaders;
  let semente: { tripId: string; identifiers: string[]; serials: string[] };

  test.beforeAll(async ({ browser }) => {
    execSync('npx vitest run --config vitest.live.config.ts tests/integration/medicao-campo-semear.live.test.ts', {
      stdio: 'pipe', timeout: 600_000, env: { ...process.env, E2E_SEMEAR_CAMPO: '1' },
    });
    semente = JSON.parse(readFileSync(SEMENTE, 'utf8'));
    context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -23.55, longitude: -46.633, accuracy: 15 });
    page = await context.newPage();
    readers = await installFieldReaders(page, { camera: true });
    await page.goto('/');
    await page.getByLabel('E-mail').fill('reg-g-admin@example.invalid');
    await page.getByLabel('Senha', { exact: true }).fill('Local-only-020!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    try {
      await page.getByRole('button', { name: 'Minha conta' }).click();
      await page.getByRole('button', { name: 'Sair' }).click();
      await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });
    } catch { /* a medição já terminou; o encerramento é só limpeza */ }
    await context?.close();
  });

  async function limitar(): Promise<void> {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }

  test(`conferência: p95 ≤ ${LIMITE_CONFERENCIA_MS} ms do código reconhecido ao cilindro conferido (10 leituras)`, async () => {
    await page.goto(`/viagens/${semente.tripId}`);
    await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Ler cilindro' }).click();
    const leitor = page.getByRole('dialog', { name: 'Ler cilindro' });
    await expect(leitor).toBeVisible();
    await limitar();
    const tempos: number[] = [];
    for (let n = 0; n < semente.identifiers.length; n += 1) {
      const inicio = await page.evaluate(() => performance.now());
      await readers.scan(semente.identifiers[n]!);
      await expect(leitor.getByText(`Cilindro ${semente.serials[n]} conferido.`)).toBeVisible({ timeout: 15_000 });
      const fim = await page.evaluate(() => performance.now());
      tempos.push(fim - inicio);
    }
    const p95 = percentil(tempos, 95);
    console.log(`[4g] leitura até conferido: mediana ${percentil(tempos, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...tempos).toFixed(0)} ms (10 leituras, Slow 4G)`);
    expect(p95).toBeLessThanOrEqual(LIMITE_CONFERENCIA_MS);
  });

  test(`posição: leitura em até ${LIMITE_POSICAO_MS / 1000} s e a tela continua respondendo`, async () => {
    await page.goto(`/viagens/${semente.tripId}`);
    await expect(page.getByRole('heading', { name: 'Conferência da carga' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Iniciar viagem' }).click();
    await page.getByRole('button', { name: /Chegada com a posição da parada 1/ }).click();
    const inicio = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Usar minha posição' }).click();
    await expect(page.getByText('Origem: GPS')).toBeVisible({ timeout: LIMITE_POSICAO_MS });
    const fim = await page.evaluate(() => performance.now());
    console.log(`[4g] leitura de posição até a tela: ${(fim - inicio).toFixed(0)} ms (GPS simulado)`);
    expect(fim - inicio).toBeLessThanOrEqual(LIMITE_POSICAO_MS);
  });
});
