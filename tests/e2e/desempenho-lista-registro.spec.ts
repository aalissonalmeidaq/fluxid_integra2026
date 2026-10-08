import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Spec 007, RNF-002: a primeira página de cada lista de cadastros (clientes, geocercas, veículos e motoristas) aparece em até 2 s (p95)
// com o volume de referência (10 mil clientes, 50 mil unidades, 50 mil geocercas, 5 mil veículos e 5 mil motoristas), em conexão 4G.
// Roda só com E2E_AO_VIVO=1 (npm run test:desempenho:registro), contra o Supabase local real e as funções carregadas: o navegador pede
// a lista de verdade (Auth, sessão, RPC e índices), com a rede limitada pelo Chrome ao perfil "Slow 4G" (Lighthouse: 150 ms de
// latência, 1,6 Mbps de descida e 750 kbps de subida). Mede do início do pedido da lista até a primeira linha visível, isto é, rede +
// servidor + renderização; o carregamento do pacote e do shell não entra, porque não é da lista.
const SQL_DIR = join(import.meta.dirname, '..', 'support', 'sql');
const AMOSTRAS = 20;
const LIMITE_MS = 2000;

const executar = (arquivo: string): void => {
  execSync(`npx supabase db query --local --file "${join(SQL_DIR, arquivo)}"`, { stdio: 'pipe', timeout: 180_000 });
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

const LISTAS = [
  { nome: 'clientes', caminho: '/clientes', operacao: 'list_customers', primeira: 'Cliente Volume 00001' },
  { nome: 'geocercas', caminho: '/geocercas', operacao: 'list_geofences', primeira: 'Geocerca 000001' },
  { nome: 'veículos', caminho: '/veiculos', operacao: 'list_vehicles', primeira: 'VOL-0001' },
  { nome: 'motoristas', caminho: '/motoristas', operacao: 'list_drivers', primeira: 'Motorista Volume 00001' },
] as const;

test.describe('Primeira página das listas de cadastros com o volume de referência em 4G', () => {
  // A massa é semeada uma vez e as quatro listas são medidas em sequência, no mesmo processo.
  test.describe.configure({ mode: 'serial' });

  // Uma só sessão para as quatro listas: o usuário tem limite de sessões simultâneas, e cada teste teria de abrir uma nova.
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    executar('registry-volume-limpar.sql');
    executar('registry-volume-semear.sql');
    context = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
    page = await context.newPage();
    await entrar(page);
  });

  test.afterAll(async () => {
    // Encerra a sessão pela tela, para não ocupar o limite de sessões do usuário nas próximas execuções.
    try {
      await page.getByRole('button', { name: 'Minha conta' }).click();
      await page.getByRole('button', { name: 'Sair' }).click();
      await expect(page.getByLabel('E-mail')).toBeVisible({ timeout: 10_000 });
    } catch { /* a medição já terminou; o encerramento é só limpeza */ }
    await context?.close();
    executar('registry-volume-limpar.sql');
  });

  for (const lista of LISTAS) {
    test(`${lista.nome}: p95 ≤ ${LIMITE_MS} ms em ${AMOSTRAS} cargas`, async () => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });

      const tempos: number[] = [];
      for (let n = 0; n < AMOSTRAS; n += 1) {
        let inicio = 0;
        const marcar = (request: import('@playwright/test').Request): void => {
          if (request.url().includes('/functions/v1/query-registry') && (request.postDataJSON() as { operation?: string } | null)?.operation === lista.operacao) inicio = performance.now();
        };
        page.on('request', marcar);
        await page.goto(lista.caminho);
        await expect(page.getByRole('link', { name: lista.primeira })).toBeVisible({ timeout: 30_000 });
        const fim = performance.now();
        page.off('request', marcar);
        expect(inicio, 'o pedido da lista não foi observado').toBeGreaterThan(0);
        tempos.push(fim - inicio);
      }

      const p95 = percentil(tempos, 95);
      console.log(`[4g] ${lista.nome}: mediana ${percentil(tempos, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...tempos).toFixed(0)} ms (${AMOSTRAS} cargas, Slow 4G)`);
      expect(p95).toBeLessThanOrEqual(LIMITE_MS);
    });
  }
});
