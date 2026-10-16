// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../src/design-system/contrast';
import { cores, usosDeCor, type NomeDeCor } from '../../src/design-system/tokens';

// Spec 011, T045 (RNF-001; design.md): todo par texto e fundo usado na landing está na tabela oficial de combinações do design system
// (usosDeCor) e passa em AA (4,5:1 para texto normal). Os pares abaixo são os de design.md; um par novo entra aqui e na tabela.
const PARES: Array<[NomeDeCor, NomeDeCor, string]> = [
  ['branco', 'navy', 'cabeçalho, rodapé, títulos e textos das seções escuras'],
  ['branco', 'azul-profundo', 'cartões do problema, numerais das etapas, cartão de documentos'],
  ['cinza-gelo', 'navy', 'subtítulo da abertura e introduções das seções escuras'],
  ['cinza-gelo', 'azul-profundo', 'descrição do cartão de documentos'],
  ['navy', 'verde-vivo', 'rótulo do botão principal e numerais do problema'],
  ['grafite', 'branco', 'títulos e textos das seções claras'],
  ['grafite', 'cinza-gelo', 'títulos e textos das seções claras'],
  ['texto-secundario', 'branco', 'descrições nos cartões'],
  ['texto-secundario', 'cinza-gelo', 'introduções das seções claras'],
  ['verde-vivo', 'navy', 'número do simulador do piloto, sobre navy sólido'],
  ['alerta-texto', 'alerta-fundo', 'selos "em validação no piloto" e efeitos do processo manual'],
  ['verde-acessivel', 'sucesso-fundo', 'selo "na plataforma"'],
  ['erro', 'erro-fundo', 'cartão dos cilindros perdidos (número e textos em vermelho)'],
  ['branco', 'erro', 'cartão do prejuízo anual'],
];

// Texto grande (24 px, ou 18,66 px em negrito): basta 3:1, e o par está na tabela oficial como texto grande.
const PARES_GRANDES: Array<[NomeDeCor, NomeDeCor, string]> = [
  ['verde-vivo', 'azul-profundo', 'frase final (h3 em negrito) onde o degradê chega ao azul-profundo'],
];

// Onde o verde-vivo é cor de texto: só números grandes e a frase final, sobre navy ou azul-profundo (pares acima). Em qualquer outro
// arquivo ele continua só fundo do botão e do numeral.
const VERDE_VIVO_COMO_TEXTO = ['sections/piloto.tsx', 'sections/chamada-final.tsx'];

const RAIZ = join(import.meta.dirname, '..', '..');
const LANDING = join(RAIZ, 'src', 'pages', 'landing');
const arquivos = (pasta: string): string[] =>
  readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
const fontes = arquivos(LANDING).filter((arquivo) => /\.tsx?$/.test(arquivo) && !/\.test\./.test(arquivo));

describe('Contraste da landing', () => {
  it.each(PARES)('%s sobre %s (%s) tem ao menos 4,5:1 e está na tabela oficial', (texto, fundo) => {
    expect(contrastRatio(cores[texto], cores[fundo])).toBeGreaterThanOrEqual(4.5);
    expect(usosDeCor).toContainEqual({ texto, fundo, finalidade: 'texto-normal' });
  });

  it.each(PARES_GRANDES)('%s sobre %s (%s) tem ao menos 3:1 e está na tabela oficial como texto grande', (texto, fundo) => {
    expect(contrastRatio(cores[texto], cores[fundo])).toBeGreaterThanOrEqual(3);
    expect(usosDeCor).toContainEqual({ texto, fundo, finalidade: 'texto-grande' });
  });

  it('nenhum texto usa as cores só decorativas (verde-vivo e azul-ciano) fora da lista permitida', () => {
    const achados: string[] = [];
    for (const arquivo of fontes) {
      const nome = relative(RAIZ, arquivo).replaceAll('\\', '/');
      const texto = readFileSync(arquivo, 'utf8');
      // O verde-vivo só é fundo do botão e do numeral; nunca cor de texto.
      if (/\btext-verde-vivo\b/.test(texto) && !VERDE_VIVO_COMO_TEXTO.some((permitido) => nome.endsWith(permitido))) achados.push(`${nome}: text-verde-vivo`);
      // O azul-ciano só aparece em linhas e bordas (a cadeia decorativa e as bordas dos cartões), nunca como cor de texto.
      if (/\btext-azul-ciano\b/.test(texto) && !nome.endsWith('sections/cadeia-decorativa.tsx')) achados.push(`${nome}: text-azul-ciano`);
    }
    expect(achados).toEqual([]);
  });

  it('o texto das seções escuras nunca usa cor de texto de fundo claro (grafite, secundário) sobre navy', () => {
    const escuras = ['hero.tsx', 'prejuizo.tsx', 'trava.tsx', 'funcionalidades.tsx', 'chamada-final.tsx', 'landing-header.tsx', 'landing-footer.tsx'];
    for (const nome of escuras) {
      const arquivo = fontes.find((caminho) => caminho.endsWith(nome));
      expect(arquivo, nome).toBeDefined();
      const texto = readFileSync(arquivo!, 'utf8');
      expect(texto, nome).not.toMatch(/\btext-(grafite|texto-secundario)\b/);
    }
  });
});
