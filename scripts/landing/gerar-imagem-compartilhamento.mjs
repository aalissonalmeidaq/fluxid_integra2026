// Gera a imagem de compartilhamento da landing page (Spec 011, T049): public/landing/og-fluxid.png, 1200 x 630 px.
// É a imagem que aparece quando o endereço é enviado por mensagem ou rede social. Sem dependência nova: compõe um HTML com o logotipo, a
// Montserrat e o mascote já versionados e fotografa com o Chromium do Playwright.
//
//   node scripts/landing/gerar-imagem-compartilhamento.mjs
//
// As cores vêm dos tokens (src/design-system/tokens.ts); nenhuma cor é escrita à mão aqui.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { cores } from '../../src/design-system/tokens.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dados = (arquivo, tipo) => `data:${tipo};base64,${readFileSync(arquivo).toString('base64')}`;
const logo = dados(join(RAIZ, 'src', 'design-system', 'brand', 'oficial', 'logo-negativa-branca.svg'), 'image/svg+xml');
const mascote = dados(join(RAIZ, 'public', 'landing', 'mascote-768.webp'), 'image/webp');
const fonte = dados(join(RAIZ, 'node_modules', '@fontsource-variable', 'montserrat', 'files', 'montserrat-latin-wght-normal.woff2'), 'font/woff2');

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Montserrat Variable'; src: url(${fonte}) format('woff2-variations'); font-weight: 100 900; }
* { box-sizing: border-box; }
body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: 'Montserrat Variable', sans-serif; color: ${cores.branco};
  background: linear-gradient(135deg, ${cores.navy}, ${cores['azul-profundo']}); position: relative; }
.texto { position: absolute; left: 72px; top: 72px; width: 640px; display: flex; flex-direction: column; gap: 32px; }
.texto img { width: 260px; }
h1 { margin: 0; font-size: 68px; line-height: 1.1; font-weight: 800; }
p { margin: 0; font-size: 28px; line-height: 1.35; color: ${cores['cinza-gelo']}; font-weight: 500; }
.mascote { position: absolute; right: 24px; top: 0; height: 630px; mix-blend-mode: screen;
  -webkit-mask-image: radial-gradient(closest-side, black 72%, transparent 100%); mask-image: radial-gradient(closest-side, black 72%, transparent 100%); }
</style></head><body>
<div class="texto"><img src="${logo}" alt=""><h1>Cada cilindro, rastreado até a entrega.</h1><p>Rastreabilidade de cilindros de gás, do estoque ao cliente, mesmo sem sinal.</p></div>
<img class="mascote" src="${mascote}" alt="">
</body></html>`;

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage({ viewport: { width: 1200, height: 630 } });
  await pagina.setContent(html);
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(300);
  const png = await pagina.screenshot({ type: 'png' });
  const destino = join(RAIZ, 'public', 'landing', 'og-fluxid.png');
  writeFileSync(destino, png);
  console.log(`${destino}: ${(png.length / 1024).toFixed(1)} KB`);
} finally {
  await navegador.close();
}
