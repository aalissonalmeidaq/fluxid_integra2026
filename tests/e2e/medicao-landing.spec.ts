import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

// Spec 011, US6 (T052; RNF-003, RNF-004, RNF-005): a landing em "Slow 4G" (1,6 Mbps e 150 ms) tem LCP de até 2,5 s, CLS abaixo de 0,1 e
// imagens da primeira dobra de até 250 KB, e o pacote de entrada do aplicativo não cresce mais de 2% sobre a linha de base da spec
// (597.791 bytes, limite 609.747). Mede em Chromium (desktop e celular), com a mediana de três amostras, e anota os valores.
const LIMITE_LCP_MS = 2500;
const LIMITE_CLS = 0.1;
const LIMITE_IMAGENS = 250 * 1024;
const LIMITE_PACOTE_DE_ENTRADA = 609_747;
const AMOSTRAS = 3;

function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.floor(ordenados.length / 2)] ?? Number.NaN;
}

test.use({ serviceWorkers: 'block' });

test.describe('Medição da landing em 4G (Spec 011)', () => {
  test('LCP, CLS e imagens da primeira dobra dentro do orçamento', async ({ browser }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-360-chromium'].includes(testInfo.project.name), 'A medição usa o Chromium (desktop e celular).');
    testInfo.setTimeout(180_000);
    const { viewport, isMobile, hasTouch, deviceScaleFactor } = testInfo.project.use;
    const lcps: number[] = [];
    const clss: number[] = [];
    let totalImagens = 0;
    for (let amostra = 0; amostra < AMOSTRAS; amostra += 1) {
      const context = await browser.newContext({ serviceWorkers: 'block', ...(viewport ? { viewport } : {}), isMobile, hasTouch, deviceScaleFactor });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const medidas = { lcp: 0, cls: 0 };
        (window as unknown as { __medidas: typeof medidas }).__medidas = medidas;
        new PerformanceObserver((lista) => {
          for (const entrada of lista.getEntries()) medidas.lcp = entrada.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((lista) => {
          for (const entrada of lista.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entrada.hadRecentInput) medidas.cls += entrada.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await new MockBackend().install(page);
      const imagens: number[] = [];
      page.on('response', (resposta) => {
        if (resposta.request().resourceType() !== 'image') return;
        void resposta.body().then((corpo) => imagens.push(corpo.length)).catch(() => undefined);
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });

      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1, name: /Saiba onde está cada cilindro/ })).toBeVisible();
      await page.waitForLoadState('load');
      await page.waitForTimeout(2500);

      const { lcp, cls } = await page.evaluate(() => (window as unknown as { __medidas: { lcp: number; cls: number } }).__medidas);
      lcps.push(lcp);
      clss.push(cls);
      totalImagens = Math.max(totalImagens, imagens.reduce((soma, bytes) => soma + bytes, 0));
      await context.close();
    }

    const lcp = mediana(lcps);
    const cls = Math.max(...clss);
    testInfo.annotations.push({ type: 'landing-lcp-ms', description: String(Math.round(lcp)) });
    testInfo.annotations.push({ type: 'landing-lcp-amostras-ms', description: lcps.map((valor) => Math.round(valor)).join(', ') });
    testInfo.annotations.push({ type: 'landing-cls', description: cls.toFixed(4) });
    testInfo.annotations.push({ type: 'landing-imagens-primeira-dobra-bytes', description: String(totalImagens) });
    expect(lcp, 'LCP').toBeGreaterThan(0);
    // O LCP depende da CPU da máquina: na integração contínua ele só é medido e anotado (como as medições das Specs 003 e 004); localmente,
    // onde a medida é estável, a mediana das amostras precisa caber no orçamento. Peso de imagens, CLS e pacote reprovam em qualquer lugar.
    if (!process.env.CI) expect(lcp, 'LCP em Slow 4G (mediana)').toBeLessThanOrEqual(LIMITE_LCP_MS);
    expect(cls, 'CLS').toBeLessThan(LIMITE_CLS);
    expect(totalImagens, 'imagens da primeira dobra').toBeLessThanOrEqual(LIMITE_IMAGENS);
  });

  test('o pacote de entrada do aplicativo não cresce mais de 2% sobre a linha de base', async () => {
    const testInfo = test.info();
    test.skip(testInfo.project.name !== 'desktop-chromium', 'O tamanho do pacote não depende do navegador.');
    const assets = join(import.meta.dirname, '..', '..', 'dist', 'assets');
    const entrada = readdirSync(assets).filter((nome) => /^index-.*\.js$/.test(nome));
    expect(entrada).toHaveLength(1);
    const bytes = statSync(join(assets, entrada[0]!)).size;
    testInfo.annotations.push({ type: 'pacote-de-entrada-bytes', description: String(bytes) });
    expect(bytes).toBeLessThanOrEqual(LIMITE_PACOTE_DE_ENTRADA);
    // A landing e as suas imagens são carregadas sob demanda: ficam fora do pacote de entrada.
    expect(readdirSync(assets).some((nome) => /^landing-page-.*\.js$/.test(nome))).toBe(true);
  });
});
