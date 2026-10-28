import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { semearRastreamento, TRACKING_TRIP_A } from './support/mock-tracking';
import { entrar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 015 (T057; US3, CS-005, CS-010): a partir do acompanhamento, o gestor reconstrói a ocorrência de afastamento só com o teclado e em
// até 2 minutos: início da viagem, posições com a lacuna explícita, as três comparações fora do limite, a ocorrência e o alerta. O
// carregamento progressivo mantém a ordem. Axe sem violação crítica ou grave e sem rolagem horizontal em 360, 768 e 1920 px.
async function gestor(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  const backend = await entrar(page, 'rastreamento-gestor');
  semearRastreamento(backend.tracking);
  return backend;
}

test.describe('Investigar trajeto e ocorrências', () => {
  test('reconstrói a ocorrência só com o teclado, em até 2 minutos', async ({ page }) => {
    const backend = await gestor(page);
    backend.tracking.historyPageSize = 5;
    const inicio = Date.now();
    await page.goto(`/rastreamento/viagens/${TRACKING_TRIP_A}`);
    const link = page.getByRole('link', { name: 'Histórico desta viagem' });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Histórico da viagem' })).toBeVisible();
    const cronologia = page.getByRole('list', { name: 'Cronologia do período' });
    await expect(cronologia).toContainText('Viagem iniciada');
    await expect(cronologia).toContainText(/Sem posição do celular entre/);
    const mais = page.getByRole('button', { name: 'Carregar mais' });
    await mais.focus();
    await page.keyboard.press('Enter');
    await expect(cronologia).toContainText('Fora do limite: 253 m');
    await expect(cronologia).toContainText('Afastamento confirmado');
    await expect(cronologia).toContainText('Alerta: Afastamento do motorista');
    await expect(page.getByRole('button', { name: 'Carregar mais' })).toHaveCount(0);
    const textos = await cronologia.getByRole('listitem').allTextContents();
    expect(textos.findIndex((t) => t.includes('Afastamento confirmado'))).toBeGreaterThan(textos.findIndex((t) => t.includes('Fora do limite: 253 m')));
    expect(Date.now() - inicio).toBeLessThan(120_000);
  });

  test('acessibilidade e sem rolagem horizontal em 360, 768 e 1920 px', async ({ page }) => {
    await gestor(page);
    for (const largura of [360, 768, 1920]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto(`/rastreamento/viagens/${TRACKING_TRIP_A}`);
      await page.getByRole('link', { name: 'Histórico desta viagem' }).click();
      await expect(page.getByRole('list', { name: 'Cronologia do período' })).toBeVisible();
      const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      expect(resultado.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'), `${largura}px`).toEqual([]);
      expect(await semRolagemHorizontal(page), `${largura}px`).toBe(true);
    }
  });

  test('endereço sem viagem orienta a abrir pelo acompanhamento', async ({ page }) => {
    await gestor(page);
    await page.goto('/rastreamento/historico');
    await expect(page.getByText('Escolha o que investigar')).toBeVisible();
  });
});
