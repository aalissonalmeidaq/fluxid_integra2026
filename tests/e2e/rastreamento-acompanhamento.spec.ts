import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { semearRastreamento, TRACKING_TRIP_A, TRACKING_TRIP_B } from './support/mock-tracking';
import { entrar, semRolagemHorizontal } from './support/trips-scenario';

test.use({ serviceWorkers: 'block' });

// Spec 015 (T022; US1, CS-004, CS-010, CS-011): acompanhar uma viagem em andamento com backend simulado. O gestor encontra a viagem pelo
// menu, vê cada origem com frescor em ícone e texto e a degradação do celular; a cronologia é a alternativa completa ao mapa e funciona
// só com teclado; a viagem de outra empresa não revela nada; quem não tem `tracking.read` não vê a tela. Axe sem violação crítica ou
// grave e sem rolagem horizontal em 360, 768 e 1920 px. Os blocos do mapa externo não são necessários para nenhuma verificação.
const LARGURAS = [360, 768, 1920] as const;

async function semViolacoes(page: Page, contexto: string): Promise<void> {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const bloqueantes = resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious');
  const evidencia = bloqueantes.map((violacao) => `${violacao.impact}: ${violacao.id} em ${violacao.nodes.map((no) => no.target.join(', ')).join('; ')}`).join('\n');
  expect(bloqueantes, `${contexto}\n${evidencia}`).toEqual([]);
}

async function gestor(page: Page) {
  // O mapa externo fica fora do teste: a tela tem de continuar utilizável sem os blocos (RF-004, CS-011).
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  const backend = await entrar(page, 'rastreamento-gestor');
  semearRastreamento(backend.tracking);
  return backend;
}

test.describe('Acompanhar uma viagem em andamento', () => {
  test('pelo menu, a lista mostra a viagem com as origens e a degradação', async ({ page }) => {
    await gestor(page);
    // Abaixo de 768 px o menu fica na gaveta.
    const menu = page.getByRole('button', { name: 'Menu' });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('link', { name: 'Rastreamento' }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Rastreamento' })).toBeVisible();
    const resumo = page.getByRole('list', { name: 'Resumo do acompanhamento' });
    await expect(resumo).toContainText('1 viagem em andamento');
    await expect(resumo).toContainText('1 viagem com acompanhamento degradado');
    const tabela = page.getByRole('table', { name: 'Viagens em andamento' });
    await expect(tabela).toContainText('Celular do motorista: Atual');
    await expect(tabela).toContainText('Lacre do C1 · TRK-A-1: Atrasada');
    await expect(tabela).toContainText('Degradado');
    await tabela.getByRole('link', { name: 'Viagem 9161' }).click();
    await expect(page).toHaveURL(`/rastreamento/viagens/${TRACKING_TRIP_A}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Viagem 9161' })).toBeVisible();
  });

  test('detalhe: frescor em texto, degradação, lacuna e seleção só com teclado', async ({ page }) => {
    await gestor(page);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.goto(`/rastreamento/viagens/${TRACKING_TRIP_A}`);
    const origens = page.getByRole('list', { name: 'Origens de posição' });
    await expect(origens.getByRole('listitem').first()).toContainText('Atual');
    await expect(origens.getByRole('listitem').nth(1)).toContainText('Atrasada');
    await expect(page.getByText('Acompanhamento degradado')).toBeVisible();
    const cronologia = page.getByRole('list', { name: 'Cronologia recente' });
    await expect(cronologia.getByText(/Sem posição do celular entre/)).toBeVisible();
    const item = cronologia.getByRole('button', { name: /Celular do motorista/ }).first();
    await item.focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    await expect(item).toBeFocused();
  });

  test('no celular, a lista é o padrão e o mapa abre pela alternância', async ({ page }) => {
    await gestor(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/rastreamento/viagens/${TRACKING_TRIP_A}`);
    const alternancia = page.getByRole('group', { name: 'Forma de ver' });
    await expect(alternancia.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('list', { name: 'Cronologia recente' })).toBeVisible();
    await alternancia.getByRole('button', { name: 'Mapa' }).click();
    await expect(page.getByRole('group', { name: 'Mapa do trajeto recente' })).toBeVisible();
  });

  test('viagem de outra empresa não revela posição nem trajeto', async ({ page }) => {
    await gestor(page);
    await page.goto(`/rastreamento/viagens/${TRACKING_TRIP_B}`);
    await expect(page.getByText('Viagem não encontrada')).toBeVisible();
    await expect(page.getByText('Motorista B')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Cronologia recente' })).toHaveCount(0);
  });

  test('sem tracking.read, o menu não mostra a tela e o endereço é negado', async ({ page }) => {
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await entrar(page, 'lacres-auditor');
    await expect(page.getByRole('link', { name: 'Rastreamento' })).toHaveCount(0);
    await page.goto('/rastreamento');
    await expect(page.getByText('Acesso negado')).toBeVisible();
  });

  test('acessibilidade e sem rolagem horizontal em 360, 768 e 1920 px', async ({ page }) => {
    await gestor(page);
    for (const largura of LARGURAS) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto('/rastreamento');
      await expect(page.getByRole('table', { name: 'Viagens em andamento' })).toBeVisible();
      await semViolacoes(page, `lista em ${largura}px`);
      expect(await semRolagemHorizontal(page), `lista em ${largura}px`).toBe(true);
      await page.goto(`/rastreamento/viagens/${TRACKING_TRIP_A}`);
      await expect(page.getByRole('list', { name: 'Cronologia recente' })).toBeVisible();
      await semViolacoes(page, `detalhe em ${largura}px`);
      expect(await semRolagemHorizontal(page), `detalhe em ${largura}px`).toBe(true);
    }
  });
});
