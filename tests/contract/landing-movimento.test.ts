// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec 011, T039 (RF-012, RNF-006): todo movimento da landing está atrás de prefers-reduced-motion: no-preference, só anima
// transform e opacity (sem layout) e nenhuma transição atrasa o anel de foco.
const css = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'pages', 'landing', 'landing.css'), 'utf8');

// Separa o conteúdo dos blocos "@media (prefers-reduced-motion: no-preference) { ... }" do resto do arquivo.
function separarMovimento(texto: string): { movimento: string; resto: string } {
  const inicio = /@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)\s*\{/g;
  let resto = '';
  let movimento = '';
  let cursor = 0;
  for (let achado = inicio.exec(texto); achado; achado = inicio.exec(texto)) {
    resto += texto.slice(cursor, achado.index);
    let profundidade = 1;
    let posicao = achado.index + achado[0].length;
    while (posicao < texto.length && profundidade > 0) {
      if (texto[posicao] === '{') profundidade += 1;
      if (texto[posicao] === '}') profundidade -= 1;
      posicao += 1;
    }
    movimento += texto.slice(achado.index + achado[0].length, posicao - 1);
    cursor = posicao;
    inicio.lastIndex = posicao;
  }
  resto += texto.slice(cursor);
  return { movimento, resto };
}

const { movimento, resto } = separarMovimento(css);

describe('Movimento da landing', () => {
  it('há movimento declarado, e só dentro de prefers-reduced-motion: no-preference', () => {
    expect(movimento).toMatch(/animation|transition/);
    expect(resto).not.toMatch(/@keyframes|\banimation\s*:|\banimation-name\s*:|\btransition\s*:|\btransition-property\s*:/);
  });

  it('só anima transform e opacity: nada de largura, altura, margem ou posição', () => {
    // Propriedades dentro dos @keyframes (entre os blocos de cada quadro).
    for (const quadros of movimento.matchAll(/@keyframes[^{]+\{([\s\S]*?)\}\s*\}/g)) {
      const propriedades = [...(quadros[1] ?? '').matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const propriedade of propriedades) expect(['opacity', 'transform'], `${propriedade} em @keyframes`).toContain(propriedade);
    }
    // Propriedades listadas nas transições.
    for (const transicao of movimento.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)) {
      const nomes = (transicao[1] ?? '').split(',').map((parte) => parte.trim().split(/\s+/)[0]);
      for (const nome of nomes) expect(['opacity', 'transform'], `transition ${nome}`).toContain(nome);
    }
  });

  it('nenhuma transição vale para outline: o anel de foco aparece sem atraso', () => {
    expect(css).not.toMatch(/transition[^;]*(outline|all)/);
  });

  it('nenhuma cor literal: só variáveis dos tokens', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/);
  });

  it('a trava tem o segundo momento autoral: o pino encaixa no anel uma vez, quando a trava entra na tela (animate de 15/10/2026)', () => {
    expect(movimento).toMatch(/\[data-revelar='visivel'\]\s+\.landing-pino-entrada\s*\{[^}]*animation:\s*landing-encaixar\b[^;]*\b1\b/);
    expect(movimento).toMatch(/@keyframes\s+landing-encaixar\b/);
  });

  it('o que muda de estado responde com movimento curto: texto da trava, blocos recolhíveis e gaveta do celular', () => {
    expect(movimento).toMatch(/\.landing-momento\s*\{[^}]*transition:\s*opacity\s+200ms/);
    expect(movimento).toMatch(/\.landing-detalhes\s*>\s*summary::after\s*\{[^}]*transition:\s*transform/);
    expect(movimento).toMatch(/\.landing-detalhes\[open\][^{]*\{[^}]*animation:\s*landing-abrir\b/);
    expect(movimento).toMatch(/\.landing-gaveta\s*\{[^}]*animation:\s*landing-gaveta-entra\b/);
    expect(movimento).toMatch(/\.landing-veu\s*\{[^}]*animation:\s*landing-escurecer\b/);
  });

  it('o anel de foco das seções escuras é branco', () => {
    expect(css).toMatch(/\.landing-escuro\s+:focus-visible\s*\{[^}]*outline-color:\s*var\(--color-branco\)/);
  });

  it('cada slide reserva uma área segura no topo e no rodapé em celular e desktop', () => {
    expect(css).toMatch(/\.landing-slide\s*\{[^}]*padding-top:\s*calc\(var\(--spacing-12\)\s*\+\s*env\(safe-area-inset-top\)\)[^}]*padding-bottom:\s*calc\(var\(--spacing-12\)\s*\+\s*env\(safe-area-inset-bottom\)\)/s);
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)[\s\S]*?\.landing-slide\s*\{[^}]*padding-top:\s*calc\(var\(--spacing-alvo\)\s*\+\s*var\(--spacing-8\)\)[^}]*padding-bottom:\s*calc\(var\(--spacing-alvo\)\s*\+\s*var\(--spacing-8\)\)/s);
  });
});
