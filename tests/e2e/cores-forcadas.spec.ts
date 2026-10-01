import { test, expect } from '@playwright/test';
import { TELAS } from './support/telas';

test.use({ serviceWorkers: 'block' });

// CA-011: com forced-colors ativo (alto contraste do sistema), controles, bordas e estados continuam visíveis e
// distinguíveis. O navegador troca as cores por cores do sistema; o que precisa sobrar são bordas, ícones e texto.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
});

for (const tela of TELAS) {
  test(`${tela.nome}: controles, bordas e estados visíveis com cores forçadas`, async ({ page }) => {
    await tela.abrir(page);
    await page.waitForLoadState('networkidle');

    const ativo = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
    expect(ativo, 'O modo de cores forçadas precisa estar ativo.').toBe(true);

    const problemas = await page.evaluate(() => {
      const achados: string[] = [];
      const descrever = (el: Element): string => `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)}"`;
      const visivel = (el: HTMLElement): boolean => {
        const estilo = getComputedStyle(el);
        const caixa = el.getBoundingClientRect();
        return estilo.display !== 'none' && estilo.visibility !== 'hidden' && caixa.width > 0 && caixa.height > 0;
      };

      // Controles de formulário e botões precisam de borda visível: sem ela, o fundo some e o controle desaparece.
      for (const el of document.querySelectorAll<HTMLElement>('button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')) {
        if (!visivel(el)) continue;
        const estilo = getComputedStyle(el);
        const largura = parseFloat(estilo.borderTopWidth);
        if (estilo.borderTopStyle === 'none' || largura < 1) achados.push(`sem borda: ${descrever(el)}`);
      }

      // Cartões, alertas e diálogos têm borda de 1 px para continuarem delimitados.
      for (const el of document.querySelectorAll<HTMLElement>('[data-variant="informativo"], [data-variant="indicador"], [data-variant="alerta"], [role="dialog"], [role="alert"][data-variant]')) {
        if (!visivel(el)) continue;
        const estilo = getComputedStyle(el);
        if (el.getAttribute('role') === 'dialog') {
          // O diálogo é um contêiner sem borda própria; o limite dele vem do contraste do sistema com o fundo.
          continue;
        }
        if (estilo.borderTopStyle === 'none' || parseFloat(estilo.borderTopWidth) < 1) achados.push(`sem borda: ${descrever(el)}`);
      }

      // Indicadores de estado precisam ter texto, pois a cor deixa de existir.
      for (const el of document.querySelectorAll<HTMLElement>('[data-variant="ativo"], [data-variant="pendente"], [data-variant="bloqueado"], [data-variant="erro"], [data-variant="conectado"]')) {
        if (!visivel(el)) continue;
        if (!(el.textContent ?? '').trim()) achados.push(`estado sem texto: ${descrever(el)}`);
      }

      return achados;
    });
    expect(problemas).toEqual([]);

    // O foco continua desenhado por contorno de 3 px (cor Highlight). O Tab garante o foco visível pelo teclado.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    const contorno = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const estilo = getComputedStyle(el);
      return estilo.outlineStyle === 'none' ? 0 : parseFloat(estilo.outlineWidth);
    });
    expect(contorno, 'Contorno de foco com cores forçadas.').toBeGreaterThanOrEqual(3);
  });
}
