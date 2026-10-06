import { test, expect } from '@playwright/test';
import { TELAS } from './support/telas';

test.use({ serviceWorkers: 'block' });

// CA-013: no navegador, os estilos computados de cada tela usam só as escalas dos tokens (tamanho e peso de fonte,
// entrelinha, margens, calhas, containers e espaçamentos). O teste de contrato `escalas-no-codigo` pega o desvio no
// código; este pega o que só aparece depois da cascata, como valores herdados do navegador.
const FONTES = [12, 16, 24, 36, 48, 64];
const PESOS = [300, 400, 500, 600, 700, 800];
const ENTRELINHAS = [1, 1.25, 1.5];
const ESPACOS = [0, 4, 8, 16, 24, 32, 48, 64];
// Margens laterais da grade por faixa de largura: 16 px no celular, 24 no tablet e 32 no desktop.
const MARGEM_DA_GRADE = (largura: number): number => (largura < 768 ? 16 : largura < 1024 ? 24 : 32);

for (const tela of TELAS) {
  test(`${tela.nome}: estilos computados nas escalas dos tokens`, async ({ page }) => {
    await tela.abrir(page);
    await page.waitForLoadState('networkidle');

    const achados = await page.evaluate(
      ({ fontes, pesos, entrelinhas, espacos }) => {
        const ofensores: string[] = [];
        const descrever = (el: Element): string => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(/\s+/).slice(0, 2).join('.')}` : ''} "${(el.textContent ?? '').trim().slice(0, 24)}"`;
        const arredondar = (valor: number): number => Math.round(valor * 100) / 100;
        const visiveis = Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter((el) => {
          const estilo = getComputedStyle(el);
          const caixa = el.getBoundingClientRect();
          return estilo.display !== 'none' && caixa.width > 0 && caixa.height > 0 && !el.closest('svg');
        });
        for (const el of visiveis) {
          const estilo = getComputedStyle(el);
          const temTexto = Array.from(el.childNodes).some((no) => no.nodeType === Node.TEXT_NODE && (no.textContent ?? '').trim().length > 0);
          if (temTexto) {
            const tamanho = arredondar(parseFloat(estilo.fontSize));
            if (!fontes.includes(tamanho)) ofensores.push(`fonte ${tamanho}px: ${descrever(el)}`);
            const peso = Number(estilo.fontWeight);
            if (!pesos.includes(peso)) ofensores.push(`peso ${peso}: ${descrever(el)}`);
            const altura = estilo.lineHeight === 'normal' ? NaN : arredondar(parseFloat(estilo.lineHeight) / parseFloat(estilo.fontSize));
            if (!entrelinhas.includes(altura)) ofensores.push(`entrelinha ${altura}: ${descrever(el)}`);
          }
          for (const propriedade of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap'] as const) {
            const bruto = estilo[propriedade];
            if (bruto === 'normal' || bruto === 'auto') continue;
            const valor = arredondar(parseFloat(bruto));
            // O campo de arquivo e o seletor nativo têm espaçamento interno do navegador, fora do controle da escala.
            if (el.matches('input[type="file"], select, input[type="datetime-local"], input[type="date"]')) continue;
            if (!espacos.includes(valor)) ofensores.push(`${propriedade} ${valor}px: ${descrever(el)}`);
          }
          // Margens automáticas viram valores grandes (centralização): só as pequenas entram na conferência.
          for (const propriedade of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const) {
            if (el.classList.contains('mx-auto')) continue;
            const valor = arredondar(parseFloat(estilo[propriedade]));
            if (valor > 0 && valor <= 64 && !espacos.includes(valor)) ofensores.push(`${propriedade} ${valor}px: ${descrever(el)}`);
          }
        }
        return ofensores;
      },
      { fontes: FONTES, pesos: PESOS, entrelinhas: ENTRELINHAS, espacos: ESPACOS },
    );
    expect([...new Set(achados)]).toEqual([]);

    // Grade: margem lateral do conteúdo e container máximo.
    const largura = page.viewportSize()?.width ?? 0;
    const principal = await page.getByRole('main').evaluate((el) => {
      const estilo = getComputedStyle(el);
      return { esquerda: parseFloat(estilo.paddingLeft), direita: parseFloat(estilo.paddingRight), maximo: el.getBoundingClientRect().width };
    });
    expect(principal.esquerda, 'Margem esquerda da grade').toBe(MARGEM_DA_GRADE(largura));
    expect(principal.direita, 'Margem direita da grade').toBe(MARGEM_DA_GRADE(largura));
    // O conteúdo ocupa toda a largura da tela (decisão da Spec 005); não há mais container máximo.
    expect(principal.maximo, 'Largura do conteúdo').toBeGreaterThan(0);
  });
}
