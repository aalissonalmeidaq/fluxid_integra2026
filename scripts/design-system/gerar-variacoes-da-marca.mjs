// Deriva, dos arquivos oficiais da marca em src/design-system/brand/oficial/, as versões que a equipe de marca não
// enviou como arquivo próprio (Spec 003, RF-024). Os arquivos oficiais nunca são alterados; as derivadas só removem
// elementos ou trocam cores, nunca redesenham.
//   logo-horizontal.svg             = logo-principal.svg sem o slogan (assinatura secundária, uso digital)
//   logo-wordmark.svg               = só o lettering "FluxID" de logo-principal.svg
//   logo-monocromatica-azul.svg     = logo-monocromatica-preta.svg em azul (#0138B3, o azul do logotipo)
//   logo-escala-de-cinza.svg        = logo-monocromatica-preta.svg em cinza
// Uso: node scripts/design-system/gerar-variacoes-da-marca.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/design-system/brand/oficial');
const ler = (nome) => fs.readFileSync(path.join(pasta, nome), 'utf8').replace(/\r\n/g, '\n');
const AZUL_DA_MARCA = '#0138B3';
const CINZA = '#6E6E6E';
const nota = (origem) => `<!-- Derivado de ${origem} por scripts/design-system/gerar-variacoes-da-marca.mjs. Não edite à mão. -->\n`;

// Caminhos <path .../> do arquivo, na ordem em que aparecem.
const caminhos = (svg) => [...svg.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);
const cabecalho = (svg) => svg.match(/<svg[^>]*>/)[0];
const definicoes = (svg) => svg.match(/<defs>[\s\S]*<\/defs>/)?.[0] ?? '';
const montar = (origem, abertura, corpo) => `${nota(origem)}${abertura}\n${corpo.join('\n')}\n</svg>\n`;
const comViewBox = (abertura, viewBox, largura, altura) =>
  abertura
    .replace(/width="[^"]+"/, `width="${largura}"`)
    .replace(/height="[^"]+"/, `height="${altura}"`)
    .replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`);

const principal = ler('logo-principal.svg');
const preta = ler('logo-monocromatica-preta.svg');

// 1) Horizontal sem slogan: o slogan é sempre o último caminho (única forma preenchida com #0239B3).
{
  const todos = caminhos(principal);
  const slogan = todos.at(-1);
  if (!slogan.includes('fill="#0239B3"')) throw new Error('O último caminho de logo-principal.svg não é o slogan.');
  const corpo = todos.slice(0, -1);
  fs.writeFileSync(path.join(pasta, 'logo-horizontal.svg'), montar('logo-principal.svg', cabecalho(principal), [...corpo, definicoes(principal)]));
}

// 2) Monocromática azul e escala de cinza: troca a única cor do arquivo preto.
for (const [arquivo, cor] of [['logo-monocromatica-azul.svg', AZUL_DA_MARCA], ['logo-escala-de-cinza.svg', CINZA]]) {
  if (!preta.includes('#030303')) throw new Error('logo-monocromatica-preta.svg mudou: cor #030303 não encontrada.');
  fs.writeFileSync(path.join(pasta, arquivo), nota('logo-monocromatica-preta.svg') + preta.replaceAll('#030303', cor));
}

// 3) Wordmark: os seis últimos caminhos antes do slogan (F, l, u, x, I, D) com o enquadramento medido no Chromium.
{
  const todos = caminhos(principal);
  const letras = todos.slice(9, 15);
  const bruto = montar('logo-principal.svg', cabecalho(principal), [...letras, definicoes(principal)]);
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage();
    await pagina.setContent(`<!doctype html><body>${bruto.replace(/<!--[\s\S]*?-->/, '')}</body>`);
    const caixa = await pagina.evaluate(() => {
      const grupo = document.querySelector('svg');
      const { x, y, width, height } = grupo.getBBox();
      return { x, y, width, height };
    });
    const margem = 1;
    const x = Math.floor(caixa.x - margem);
    const y = Math.floor(caixa.y - margem);
    const largura = Math.ceil(caixa.width + 2 * margem);
    const altura = Math.ceil(caixa.height + 2 * margem);
    const abertura = comViewBox(cabecalho(principal), `${x} ${y} ${largura} ${altura}`, largura, altura);
    fs.writeFileSync(path.join(pasta, 'logo-wordmark.svg'), montar('logo-principal.svg', abertura, [...letras, definicoes(principal)]));
  } finally {
    await navegador.close();
  }
}

console.log('Variações geradas em src/design-system/brand/oficial/');
