import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TELAS } from './support/telas';

test.use({ serviceWorkers: 'block' });

// Larguras de referência (CA-001, CA-005): cada projeto fixa a sua; a asserção abaixo impede que um projeto rode na largura errada.
const LARGURA_POR_PROJETO: Record<string, number> = { 'mobile-360-chromium': 360, 'tablet-768': 768, 'desktop-1920': 1920 };

test.beforeEach(async ({ page }, testInfo) => {
  const esperada = LARGURA_POR_PROJETO[testInfo.project.name];
  if (esperada) expect(page.viewportSize()?.width, 'A largura do viewport não é a de referência do projeto.').toBe(esperada);
});

const dominiosExternos = (urls: readonly string[]): string[] =>
  urls.filter((url) => {
    const { protocol, hostname } = new URL(url);
    return /^https?:$/.test(protocol) && hostname !== 'localhost' && hostname !== '127.0.0.1';
  });

const semRolagemHorizontal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

// Controles com alvo menor que 44 por 44 px, exceto link em linha dentro de texto (WCAG 2.5.8).
async function alvosPequenos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seletor = 'button, [role="button"], input:not([type="hidden"]), select, textarea, summary, a[href]';
    const pequenos: string[] = [];
    for (const elemento of document.querySelectorAll<HTMLElement>(seletor)) {
      const estilo = getComputedStyle(elemento);
      if (estilo.visibility === 'hidden' || estilo.display === 'none') continue;
      const caixa = elemento.getBoundingClientRect();
      if (caixa.width === 0 || caixa.height === 0) continue;
      if (elemento.matches('a[href]') && estilo.display === 'inline') continue;
      // O link de pular só aparece com o foco; o tamanho dele é conferido à parte.
      if (elemento.matches('a[href="#main-content"]')) continue;
      // Caixas e rádios são ativados pelo rótulo que os envolve; vale o tamanho do rótulo.
      if (elemento.matches('input[type="checkbox"], input[type="radio"]') && elemento.closest('label')) {
        const rotulo = elemento.closest('label')!.getBoundingClientRect();
        if (rotulo.width >= 44 && rotulo.height >= 44) continue;
      }
      if (caixa.width < 44 || caixa.height < 44) {
        const nome = (elemento.textContent ?? elemento.getAttribute('aria-label') ?? '').trim().slice(0, 40);
        pequenos.push(`${elemento.tagName.toLowerCase()} "${nome}" ${Math.round(caixa.width)}x${Math.round(caixa.height)}`);
      }
    }
    return pequenos;
  });
}

for (const tela of TELAS) {
  test.describe(`Tela: ${tela.nome}`, () => {
    test('axe, rede, reflow, zoom de 200% e alvos de 44 px', async ({ page }) => {
      const requisicoes: string[] = [];
      page.on('request', (requisicao) => requisicoes.push(requisicao.url()));
      await tela.abrir(page);
      await page.waitForLoadState('networkidle');

      // Acessibilidade: críticas e graves bloqueiam; moderadas e leves entram no relatório (CA-004, MS-001).
      const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      const bloqueantes = resultado.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');
      const outras = resultado.violations.filter((item) => item.impact !== 'critical' && item.impact !== 'serious');
      test.info().annotations.push({ type: 'axe-moderadas-e-leves', description: outras.map((item) => `${item.impact}: ${item.id}`).join('; ') || 'nenhuma' });
      expect(bloqueantes.map((item) => `${item.id}: ${item.nodes.map((no) => no.target.join(' ')).join('; ')}`)).toEqual([]);

      // Nenhuma requisição a domínio externo (CA-004, RF-030).
      expect(dominiosExternos(requisicoes), 'Requisições a domínios externos.').toEqual([]);

      // Sem rolagem horizontal na largura de referência (CA-005).
      expect(await semRolagemHorizontal(page), 'Rolagem horizontal na largura de referência.').toBe(true);

      // Alvos de 44 por 44 px (CA-003, MS-003), incluindo o link de pular quando recebe o foco.
      expect(await alvosPequenos(page), 'Controles menores que 44 por 44 px.').toEqual([]);
      const pular = page.getByRole('link', { name: 'Pular para o conteúdo principal' });
      await pular.focus();
      const caixaDoLink = await pular.boundingBox();
      expect(caixaDoLink?.height ?? 0, 'Link de pular com o foco.').toBeGreaterThanOrEqual(44);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      // Zoom de 200%: o viewport equivale à metade da largura, com mínimo de 320 px (WCAG 1.4.10).
      const largura = Math.max(320, Math.round((page.viewportSize()?.width ?? 360) / 2));
      await page.setViewportSize({ width: largura, height: 640 });
      expect(await semRolagemHorizontal(page), `Rolagem horizontal com zoom de 200% (${largura} px).`).toBe(true);
    });
  });
}
