import { test, expect } from '@playwright/test';

// CA-008: linha de base visual de cada página do catálogo do design system em 360, 768 e 1920 px. Só Chromium, com
// capturas de referência geradas no Linux (veja o quickstart da Spec 003).
const CATALOGO = 'http://127.0.0.1:4174';
const SECOES = ['inicio', 'cores', 'tipografia', 'layout', 'componentes', 'icones', 'logotipo', 'excecoes'] as const;
const LARGURAS = [
  { nome: '360', largura: 360, altura: 640 },
  { nome: '768', largura: 768, altura: 1024 },
  { nome: '1920', largura: 1920, altura: 1080 },
] as const;

test.use({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: 'light' });

for (const { nome, largura, altura } of LARGURAS) {
  test.describe(`catálogo em ${nome} px`, () => {
    test.use({ viewport: { width: largura, height: altura } });

    for (const secao of SECOES) {
      test(`página ${secao}`, async ({ page }) => {
        await page.goto(`${CATALOGO}/#/${secao}`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveScreenshot(`catalogo-${secao}-${nome}.png`, { maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide' });
      });
    }
  });
}
