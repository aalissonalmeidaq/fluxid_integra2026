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

  // Spec 004 (RNF-001, MS-006): o shell autenticado, que é onde o menu existe, não pode piorar mais de 20% em relação à linha
  // de base de 132 ms da Spec 003 (limite de 158 ms). Mede, ao recarregar com a sessão ativa, o tempo até o botão "Sair" estar
  // visível (presente antes e depois do menu, para a comparação ser justa) e, quando existe, até o menu estar visível, além
  // da duração da consulta de permissões no navegador (p95 de até 1 s com o backend simulado). Só mede e anota.
  test('mede o shell autenticado com o menu e a consulta de permissões', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'A medição de referência usa só o desktop em Chromium.');
    testInfo.setTimeout(180_000);
    const shell: number[] = [];
    const menu: number[] = [];
    const consulta: number[] = [];
    for (let index = 0; index < SAMPLES * 2; index += 1) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const backend = new MockBackend();
      backend.loginResponses = [backend.authenticated()];
      backend.statusResponse = backend.activeStatus('aal1');
      await backend.install(page);
      await page.goto('/');
      await page.getByLabel('E-mail').fill('admin-a@example.invalid');
      await page.getByLabel('Senha', { exact: true }).fill('Local-only-002!');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('button', { name: 'Sair' }).waitFor();
      await page.waitForLoadState('networkidle');

      const startedAt = Date.now();
      await page.reload();
      await page.getByRole('button', { name: 'Sair' }).waitFor();
      shell.push(Date.now() - startedAt);
      const menuLink = page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: /Início/ });
      if (await menuLink.waitFor({ timeout: 1_500 }).then(() => true, () => false)) menu.push(Date.now() - startedAt);
      await page.waitForLoadState('networkidle');
      consulta.push(...await page.evaluate(() => performance.getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/functions/v1/query-permissions')).map((entry) => entry.duration)));
      await context.close();
    }
    const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)] ?? Number.NaN;
    testInfo.annotations.push({ type: 'shell-autenticado-ms-mediana', description: String(median(shell)) });
    testInfo.annotations.push({ type: 'shell-autenticado-amostras-ms', description: shell.join(', ') });
    testInfo.annotations.push({ type: 'menu-visivel-ms-mediana', description: menu.length ? String(median(menu)) : 'sem menu' });
    testInfo.annotations.push({ type: 'consulta-permissoes-ms-p95', description: consulta.length ? String(Math.round(p95(consulta))) : 'sem consulta' });
    testInfo.annotations.push({ type: 'consulta-permissoes-amostras', description: String(consulta.length) });
  });
});
