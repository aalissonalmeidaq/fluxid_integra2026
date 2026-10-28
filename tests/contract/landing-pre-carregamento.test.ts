import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARCADOR_DOS_MODULOS, injetarModulosDaLanding } from '../../scripts/landing/pre-carregar-modulo';

// Spec 015 (T130; orçamento de LCP da Spec 011): o módulo da landing desenha a abertura (o LCP). Sem aviso, ele só começa a baixar depois
// de o pacote de entrada chegar e rodar, em cascata. O index.html pede o módulo e o estilo dele junto com o pacote de entrada, só na landing.
const RAIZ = join(import.meta.dirname, '..', '..');
const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');

const pacote = {
  'assets/index-a1.js': { type: 'chunk' as const, name: 'index', fileName: 'assets/index-a1.js', isEntry: true, imports: [] },
  'assets/landing-page-b2.js': {
    type: 'chunk' as const, name: 'landing-page', fileName: 'assets/landing-page-b2.js', isEntry: false,
    imports: ['assets/index-a1.js', 'assets/design-system-c3.js'], viteMetadata: { importedCss: new Set(['assets/landing-page-d4.css']) },
  },
  'assets/design-system-c3.js': { type: 'chunk' as const, name: 'design-system', fileName: 'assets/design-system-c3.js', isEntry: false, imports: [] },
  'assets/landing-page-d4.css': { type: 'asset' as const, fileName: 'assets/landing-page-d4.css' },
};

describe('pré-carregamento do módulo da landing', () => {
  it('o index.html tem o marcador dentro do bloco que só roda na landing do navegador', () => {
    expect(html.split(MARCADOR_DOS_MODULOS)).toHaveLength(2);
    const bloco = html.slice(html.indexOf("if (location.pathname === '/'"), html.indexOf('</script>'));
    expect(bloco).toContain(MARCADOR_DOS_MODULOS);
    expect(bloco).toContain("'modulepreload'");
  });

  it('troca o marcador pelo módulo da landing, os módulos que ele importa (menos o de entrada) e o estilo dele', () => {
    const resultado = injetarModulosDaLanding(html, pacote, '/');
    expect(resultado).not.toContain(MARCADOR_DOS_MODULOS);
    expect(resultado).toContain('["/assets/landing-page-b2.js","/assets/design-system-c3.js","/assets/landing-page-d4.css"]');
    expect(resultado).not.toContain('index-a1.js');
  });

  it('reprova o build se o marcador ou o módulo da landing sumirem (o aviso não some sem ninguém notar)', () => {
    expect(() => injetarModulosDaLanding('<html></html>', pacote, '/')).toThrow(/marcador/);
    const semLanding = Object.fromEntries(Object.entries(pacote).filter(([arquivo]) => !arquivo.includes('landing-page-b2')));
    expect(() => injetarModulosDaLanding(html, semLanding, '/')).toThrow(/landing-page/);
  });
});
