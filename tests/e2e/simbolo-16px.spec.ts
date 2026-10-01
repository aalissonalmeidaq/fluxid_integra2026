import { test, expect, type Page } from '@playwright/test';
import { medirSimbolo } from './support/medir-simbolo';

// CA-012, RF-025: o símbolo oficial (icone.svg, sem versão reduzida) continua distinguível a 16 px. A medição rasteriza o
// símbolo no catálogo, com escala de dispositivo 1, e mede as formas relevantes, a cobertura e a menor forma. Os limites
// abaixo foram calibrados com o símbolo real e devem ser revistos por Alisson Almeida no catálogo (MS-008).
const CATALOGO = 'http://127.0.0.1:4174';
// Forma relevante: ao menos 6 pixels conectados. Os pontos da órbita do desenho oficial têm menos de 1 px a 16 px e
// somem na redução: são decoração, não forma.
const AREA_MINIMA_DA_FORMA = 6;
// Escudo e pino distintos (no mínimo duas formas) sem se fragmentar (no máximo quatro).
const FORMAS_MINIMAS = 2;
const FORMAS_MAXIMAS = 4;
const COBERTURA_MINIMA = 0.2;
const COBERTURA_MAXIMA = 0.8;
const LARGURA_MINIMA_DA_FORMA_EM_PX = 2;

test.use({ deviceScaleFactor: 1 });

async function recortar(page: Page, tamanho: number): Promise<Buffer> {
  const figura = page.locator('figure').filter({ hasText: `${tamanho} px` }).filter({ has: page.getByRole('img', { name: 'FluxID' }) }).first();
  // O símbolo isolado é a única imagem "FluxID" dentro dessa figura.
  return figura.getByRole('img', { name: 'FluxID' }).screenshot();
}

test.describe('Símbolo oficial a 16 px', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${CATALOGO}/#/logotipo`);
    await page.getByRole('heading', { level: 1, name: 'Logotipo' }).waitFor();
    await page.evaluate(() => document.fonts.ready);
  });

  test('mantém escudo e pino distintos, sem se fragmentar', async ({ page }, testInfo) => {
    const medidas = await medirSimbolo(page, await recortar(page, 16), AREA_MINIMA_DA_FORMA);
    testInfo.annotations.push({ type: 'medidas-16px', description: JSON.stringify(medidas) });
    expect(medidas.formasRelevantes).toBeGreaterThanOrEqual(FORMAS_MINIMAS);
    expect(medidas.formasRelevantes).toBeLessThanOrEqual(FORMAS_MAXIMAS);
  });

  test('tem cobertura de pixels entre 20% e 80% da área', async ({ page }) => {
    const { cobertura } = await medirSimbolo(page, await recortar(page, 16), AREA_MINIMA_DA_FORMA);
    expect(cobertura).toBeGreaterThanOrEqual(COBERTURA_MINIMA);
    expect(cobertura).toBeLessThanOrEqual(COBERTURA_MAXIMA);
  });

  test('nenhuma forma relevante tem menos de 2 px de largura', async ({ page }) => {
    const { menorLargura } = await medirSimbolo(page, await recortar(page, 16), AREA_MINIMA_DA_FORMA);
    expect(menorLargura).toBeGreaterThanOrEqual(LARGURA_MINIMA_DA_FORMA_EM_PX);
  });
});
