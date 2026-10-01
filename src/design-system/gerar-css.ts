import {
  ALVO_MINIMO,
  containers,
  cores,
  espacamento,
  gradientes,
  pontosDeQuebra,
  raios,
  sombras,
  tipografia,
} from './tokens.ts';

const px = (valor: number): string => `${valor}px`;
const linha = (nome: string, valor: string | number): string => `  --${nome}: ${valor};`;

function familia(): string {
  return tipografia.familia.map((nome) => (nome.includes(' ') ? `'${nome}'` : nome)).join(', ');
}

function definicoes(): string[] {
  const saida: string[] = [];
  for (const [nome, valor] of Object.entries(cores)) saida.push(linha(`color-${nome}`, valor));
  for (const [nome, valor] of Object.entries(espacamento)) saida.push(linha(`spacing-${nome}`, px(valor)));
  saida.push(linha('spacing-alvo', px(ALVO_MINIMO)));
  for (const [nome, tamanho] of Object.entries(tipografia.tamanhos)) {
    saida.push(linha(`text-${nome}`, px(tamanho)));
    saida.push(linha(`text-${nome}--line-height`, tipografia.entrelinhas[nome as keyof typeof tipografia.entrelinhas]));
  }
  for (const [nome, peso] of Object.entries(tipografia.pesos)) saida.push(linha(`font-weight-${nome}`, peso));
  saida.push(linha('font-sans', familia()));
  for (const [nome, raio] of Object.entries(raios)) saida.push(linha(`radius-${nome}`, px(raio)));
  for (const [nome, sombra] of Object.entries(sombras)) saida.push(linha(`shadow-${nome}`, sombra));
  for (const [nome, ponto] of Object.entries(pontosDeQuebra)) saida.push(linha(`breakpoint-${nome}`, px(ponto)));
  for (const [nome, largura] of Object.entries(containers)) saida.push(linha(`container-${nome}`, px(largura)));
  return saida;
}

function zeramentos(): string[] {
  return ['color-*', 'spacing', 'spacing-*', 'text-*', 'font-weight-*', 'radius-*', 'shadow-*', 'breakpoint-*', 'container-*'].map(
    (nome) => linha(nome, 'initial'),
  ).concat([linha('font-serif', 'initial'), linha('font-mono', 'initial')]);
}

function gradientesCss(): string[] {
  return Object.entries(gradientes).map(([nome, g]) => {
    const de = cores[g.de as keyof typeof cores];
    const para = cores[g.para as keyof typeof cores];
    return linha(`gradiente-${nome}`, `linear-gradient(135deg, ${de}, ${para})`);
  });
}

const CABECALHO = (arquivo: string): string =>
  `/* ${arquivo}: gerado por scripts/design-system/gerar-tokens-css.mjs a partir de src/design-system/tokens.ts. Não edite. */`;

// Tema estrito: zera as escalas padrão do Tailwind, de modo que classe fora dos tokens não gere estilo (RNF-006).
export function gerarTokensCss(): string {
  return [CABECALHO('tokens.css'), '@theme static {', ...zeramentos(), ...definicoes(), '}', '', ':root {', ...gradientesCss(), '}', ''].join('\n');
}

