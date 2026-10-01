import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// O catálogo do design system (RF-011) roda em outra porta, só em desenvolvimento e CI. Estes testes cobrem
// acessibilidade, teclado, ausência de recursos de terceiros, ausência de rolagem horizontal e a completude dos
// ícones (CA-001, CA-004, CA-005, CA-010, MS-006, MS-009).
const CATALOGO = 'http://127.0.0.1:4174';
const SECOES = ['inicio', 'cores', 'tipografia', 'layout', 'componentes', 'icones', 'logotipo', 'excecoes'] as const;

async function abrir(page: Page, secao: string): Promise<void> {
  await page.goto(`${CATALOGO}/#/${secao}`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}

test.describe('Catálogo do design system', () => {
  for (const secao of SECOES) {
    test(`a página ${secao} não possui violações críticas ou graves de acessibilidade`, async ({ page }, testInfo) => {
      await abrir(page, secao);
      const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
      const bloqueantes = resultado.violations.filter((violacao) => violacao.impact === 'critical' || violacao.impact === 'serious');
      const outras = resultado.violations.filter((violacao) => !bloqueantes.includes(violacao));
      // Violações moderadas e leves não bloqueiam, mas entram no relatório para revisão na aprovação do ciclo.
      if (outras.length > 0) testInfo.annotations.push({ type: 'a11y-nao-bloqueantes', description: outras.map((v) => `${v.impact}: ${v.id}`).join('; ') });
      const evidencia = bloqueantes.map((v) => `${v.impact}: ${v.id} em ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`).join('\n');
      expect(bloqueantes, evidencia || 'Nenhuma violação crítica ou grave.').toEqual([]);
    });

    test(`a página ${secao} não tem rolagem horizontal`, async ({ page }) => {
      await abrir(page, secao);
      const { rolagem, janela } = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, janela: document.documentElement.clientWidth }));
      expect(rolagem).toBeLessThanOrEqual(janela);
    });
  }

  test('o primeiro Tab leva ao link de pular e ativá-lo move o foco ao conteúdo principal', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'O driver WebKit do Playwright no Windows não encaminha Tab ao foco da página.');
    await abrir(page, 'inicio');
    await page.keyboard.press('Tab');
    const link = page.getByRole('link', { name: 'Pular para o conteúdo principal' });
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('a navegação marca a seção atual e todos os links têm alvo de 44 px', async ({ page }) => {
    await abrir(page, 'cores');
    await expect(page.getByRole('link', { name: 'Cores', exact: true })).toHaveAttribute('aria-current', 'page');
    const links = page.getByRole('navigation', { name: 'Seções do catálogo' }).getByRole('link');
    for (const link of await links.all()) {
      const caixa = await link.boundingBox();
      expect(caixa?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('a página de componentes documenta cada componente com variantes, estados, orientação e acessibilidade', async ({ page }) => {
    await abrir(page, 'componentes');
    const secoes = page.getByRole('region');
    expect(await secoes.count()).toBeGreaterThanOrEqual(20);
    for (const titulo of ['Variantes', 'Estados', 'Orientação de uso', 'Acessibilidade', 'Exemplos']) {
      expect(await page.getByRole('heading', { name: titulo, exact: true }).count()).toBeGreaterThanOrEqual(20);
    }
  });

  test('a página de ícones mostra os 30 ícones em quatro tamanhos, quatro estados e quatro variantes', async ({ page }) => {
    await abrir(page, 'icones');
    const artigos = page.getByRole('article');
    await expect(artigos).toHaveCount(30);
    for (const artigo of await artigos.all()) {
      await expect(artigo.locator('figure')).toHaveCount(12);
      await expect(artigo.locator('svg')).toHaveCount(12);
    }
    for (const legenda of ['16 px', '24 px', '32 px', '48 px', 'Padrão', 'Ativo', 'Desabilitado', 'Erro', 'Contorno', 'Duotone', 'Monocromática', 'Negativa']) {
      expect(await page.getByText(legenda, { exact: true }).count()).toBe(30);
    }
  });

  test('a página do logotipo mostra as nove versões, os fundos aprovados, a proteção, a redução e os usos incorretos', async ({ page }) => {
    await abrir(page, 'logotipo');
    await expect(page.getByRole('article')).toHaveCount(9);
    for (const titulo of ['Fundos aprovados', 'Área de proteção e redução mínima', 'Usos incorretos']) {
      await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
    }
    for (const incorreto of ['Não distorcer', 'Não alterar as cores', 'Não girar', 'Não aplicar sombras', 'Não trocar a tipografia']) {
      await expect(page.getByText(incorreto)).toBeVisible();
    }
  });

  test('nenhuma página carrega recurso de domínio de terceiros', async ({ page }) => {
    const externos: string[] = [];
    page.on('request', (requisicao) => {
      const url = requisicao.url();
      if (!/^(data:|blob:|about:)/.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url)) externos.push(url);
    });
    for (const secao of SECOES) await abrir(page, secao);
    expect(externos).toEqual([]);
  });

  test('a fonte Montserrat é carregada do próprio catálogo', async ({ page }) => {
    await abrir(page, 'tipografia');
    const carregada = await page.evaluate(async () => {
      await document.fonts.load("800 16px 'Montserrat Variable'");
      return document.fonts.check("800 16px 'Montserrat Variable'");
    });
    expect(carregada).toBe(true);
  });
});
