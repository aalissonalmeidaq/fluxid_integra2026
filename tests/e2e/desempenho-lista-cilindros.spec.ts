import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

// Spec 006, RNF-002: a primeira página da lista de cilindros aparece em até 2 s (p95) com 50 mil cilindros, em conexão 4G.
// Roda só com E2E_AO_VIVO=1 (npm run test:desempenho:cilindros), contra o Supabase local real e as funções carregadas: o navegador
// pede a lista de verdade (Auth, sessão, RPC e índices), com a rede limitada pelo Chrome ao perfil "Slow 4G" (Lighthouse:
// 150 ms de latência, 1,6 Mbps de descida e 750 kbps de subida). Mede do início do pedido da lista até a primeira linha visível,
// isto é, rede + servidor + renderização; o carregamento do pacote e do shell não entra, porque não é da lista.
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

test.describe('Lista de cilindros com 50 mil cilindros em 4G', () => {
  test.beforeAll(() => {
    executar('cilindros-volume-limpar.sql');
    executar('cilindros-volume-semear.sql');
  });

  test.afterAll(() => {
    executar('cilindros-volume-limpar.sql');
  });

  test(`primeira página: p95 ≤ ${LIMITE_MS} ms em ${AMOSTRAS} cargas`, async ({ page, context }) => {
    await entrar(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });

    const tempos: number[] = [];
    for (let n = 0; n < AMOSTRAS; n += 1) {
      let inicio = 0;
      const marcar = (request: import('@playwright/test').Request): void => {
        if (request.url().includes('/functions/v1/query-cylinders') && (request.postDataJSON() as { operation?: string } | null)?.operation === 'list') inicio = performance.now();
      };
      page.on('request', marcar);
      await page.goto('/cilindros');
      await expect(page.getByRole('link', { name: 'VOL-000001' })).toBeVisible({ timeout: 30_000 });
      const fim = performance.now();
      page.off('request', marcar);
      expect(inicio, 'o pedido da lista não foi observado').toBeGreaterThan(0);
      tempos.push(fim - inicio);
    }

    const p95 = percentil(tempos, 95);
    console.log(`[4g] primeira página da lista: mediana ${percentil(tempos, 50).toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, máx ${Math.max(...tempos).toFixed(0)} ms (${AMOSTRAS} cargas, 50 mil cilindros, Slow 4G)`);
    expect(p95).toBeLessThanOrEqual(LIMITE_MS);
  });
});
