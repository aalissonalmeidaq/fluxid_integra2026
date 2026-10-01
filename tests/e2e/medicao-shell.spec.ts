import { test } from '@playwright/test';
import { MockBackend } from './support/mock-backend';

// RNF-004 da Spec 003: o carregamento inicial do shell não pode piorar mais de 20% em relação à linha de base medida
// antes do redesenho. Este teste só mede e anota (não reprova): a comparação fica em
// specs/003-design-system-telas/baseline-desempenho.md. Mede, em Chromium e sem service worker, o tempo até a tela de
// entrada estar visível e o total de bytes transferidos pela carga.
const SAMPLES = 10;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

test.describe('Medição do carregamento do shell (RNF-004 da Spec 003)', () => {
  test('mede o tempo até a entrada visível e os bytes transferidos', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'A medição de referência usa só o desktop em Chromium.');
    testInfo.setTimeout(120_000);
    const visible: number[] = [];
    const bytes: number[] = [];
    for (let index = 0; index < SAMPLES; index += 1) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      let transferred = 0;
      page.on('response', (response) => {
        void response.body().then((body) => { transferred += body.length; }).catch(() => undefined);
      });
      await new MockBackend().install(page);
      const startedAt = Date.now();
      await page.goto('/');
      await page.getByRole('heading', { name: 'Entrar no FluxID' }).waitFor();
      visible.push(Date.now() - startedAt);
      await page.waitForLoadState('networkidle');
      bytes.push(transferred);
      await context.close();
    }
    testInfo.annotations.push({ type: 'shell-visivel-ms-mediana', description: String(median(visible)) });
    testInfo.annotations.push({ type: 'shell-bytes-mediana', description: String(median(bytes)) });
    testInfo.annotations.push({ type: 'shell-amostras-ms', description: visible.join(', ') });
  });
});
