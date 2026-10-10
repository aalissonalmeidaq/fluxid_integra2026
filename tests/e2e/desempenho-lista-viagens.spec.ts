import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect, type BrowserContext, type Page, type Request } from '@playwright/test';

// Spec 008, RNF-001: a lista de viagens aparece em até 2 s (p95) e o detalhe em até 1,5 s (p95) com o volume de referência (10 mil
// viagens, 50 mil paradas e 200 mil itens de carga), em conexão 4G. Roda só com E2E_AO_VIVO=1 (npm run test:desempenho:viagens),
// contra o Supabase local real e as funções carregadas, com a rede limitada pelo Chrome ao perfil "Slow 4G" (Lighthouse: 150 ms de
// latência, 1,6 Mbps de descida e 750 kbps de subida). Mede do início do pedido até o primeiro conteúdo visível: rede + servidor +
// renderização; o carregamento do pacote e do shell não entra, porque não é da lista nem do detalhe.
const SQL_DIR = join(import.meta.dirname, '..', 'support', 'sql');
const AMOSTRAS = 20;
const LIMITE_LISTA_MS = 2000;
const LIMITE_DETALHE_MS = 1500;

const executar = (arquivo: string): void => {
  execSync(`npx supabase db query --local --file "${join(SQL_DIR, arquivo)}"`, { stdio: 'pipe', timeout: 600_000 });
};

const percentil = (valores: number[], p: number): number => {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)] ?? 0;
};

async function entrar(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-mail').fill('cyl-f-admin@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Local-only-018!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Visão geral' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Lista e detalhe de viagens com o volume de referência em 4G', () => {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    // As viagens usam os cadastros da massa da Spec 007 (unidades, veículos e motoristas).
    executar('trips-volume-limpar.sql');
    executar('registry-volume-limpar.sql');
    executar('registry-volume-semear.sql');
    executar('trips-volume-semear.sql');
    context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
    page = await context.newPage();
    await entrar(page);
  });

  test.afterAll(async () => {
    try {
      await page.getByRole('button', { name: 'Minha conta' }).click();
      await page.getByRole('button', { name: 'Sair' }).click();
      await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });
    } catch { /* a medição já terminou; o encerramento é só limpeza */ }
    await context?.close();
    executar('trips-volume-limpar.sql');
    executar('registry-volume-limpar.sql');
  });

  async function limitar(): Promise<void> {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  }

  const vistos: string[] = [];
  const marcarPedido = (operacao: string, onStart: () => void) => (request: Request): void => {
    if (!request.url().includes('/functions/v1/')) return;
    const corpo = request.postData() ?? '';
    vistos.push(`${request.url().split('/').pop()}:${corpo.slice(0, 60)}`);
    if (request.url().includes('/functions/v1/query-trips') && corpo.includes(`"operation":"${operacao}"`)) onStart();
  };

  test(`lista: p95 ≤ ${LIMITE_LISTA_MS} ms em ${AMOSTRAS} cargas`, async () => {
    await limitar();
    const tempos: number[] = [];
    for (let n = 0; n < AMOSTRAS; n += 1) {
      let inicio = 0;
      const marcar = marcarPedido('list_trips', () => { inicio = performance.now(); });
      page.on('request', marcar);
      await page.goto('/viagens');
      await expect(page.getByRole('link', { name: /^n\.º \d+$/ }).first()).toBeVisible({ timeout: 30_000 });
      const fim = performance.now();
      page.off('request', marcar);
      expect(inicio, 'o pedido da lista não foi observado').toBeGreaterThan(0);
      tempos.push(fim - inicio);
    }
    const p95 = percentil(tempos, 95);
    console.log(`[4g] lista de viagens: mediana ${percentil(tempos, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...tempos).toFixed(0)} ms (${AMOSTRAS} cargas, Slow 4G)`);
    expect(p95).toBeLessThanOrEqual(LIMITE_LISTA_MS);
  });

  test(`detalhe: p95 ≤ ${LIMITE_DETALHE_MS} ms em ${AMOSTRAS} cargas`, async () => {
    await limitar();
    await page.goto('/viagens');
    await expect(page.getByRole('link', { name: /^n\.º \d+$/ }).first()).toBeVisible({ timeout: 30_000 });
    const hrefs = await page.getByRole('link', { name: /^n\.º \d+$/ }).evaluateAll((links) => links.slice(0, 20).map((link) => (link as HTMLAnchorElement).getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    const tempos: number[] = [];
    for (let n = 0; n < AMOSTRAS; n += 1) {
      let inicio = 0;
      const marcar = marcarPedido('get_trip', () => { inicio = performance.now(); });
      page.on('request', marcar);
      await page.goto(hrefs[n % hrefs.length]!);
      await expect(page.getByRole('heading', { level: 3, name: 'Paradas e carga' })).toBeVisible({ timeout: 30_000 });
      const fim = performance.now();
      page.off('request', marcar);
      expect(inicio, `o pedido do detalhe não foi observado; vistos: ${vistos.slice(-6).join(' | ')}`).toBeGreaterThan(0);
      tempos.push(fim - inicio);
    }
    const p95 = percentil(tempos, 95);
    console.log(`[4g] detalhe de viagem: mediana ${percentil(tempos, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...tempos).toFixed(0)} ms (${AMOSTRAS} cargas, Slow 4G)`);
    expect(p95).toBeLessThanOrEqual(LIMITE_DETALHE_MS);
  });
});
