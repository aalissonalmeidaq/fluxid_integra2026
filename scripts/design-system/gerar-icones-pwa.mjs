// Gera o favicon e os ícones de instalação da PWA a partir do símbolo oficial da marca (Spec 003, RF-025).
// Uso: node scripts/design-system/gerar-icones-pwa.mjs
// O favicon é uma cópia exata do icone.svg oficial. O Chromium do Playwright rasteriza o mesmo arquivo para os PNG, sem
// dependência extra.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publico = path.join(raiz, 'public');
const iconeOficial = path.join(raiz, 'src', 'design-system', 'brand', 'oficial', 'icone.svg');

// Proporção largura/altura do ícone oficial (viewBox 104 por 126).
const PROPORCAO = 104 / 126;
const FUNDO_BRANCO = '#FFFFFF';

// Favicon: cópia byte a byte do arquivo oficial, sem nenhuma alteração.
fs.copyFileSync(iconeOficial, path.join(publico, 'favicon.svg'));

// Ícones de instalação: o símbolo oficial sobre branco; o "maskable" fica dentro da zona segura de máscara (cerca de 56%
// da altura).
const dataUrl = `data:image/svg+xml;base64,${fs.readFileSync(iconeOficial).toString('base64')}`;
const icones = [
  { arquivo: 'icon-192.png', lado: 192, proporcao: 0.74 },
  { arquivo: 'icon-512.png', lado: 512, proporcao: 0.74 },
  { arquivo: 'maskable-512.png', lado: 512, proporcao: 0.56 },
];

const navegador = await chromium.launch();
try {
  for (const { arquivo, lado, proporcao } of icones) {
    const pagina = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
    const altura = Math.round(lado * proporcao);
    const largura = Math.round(altura * PROPORCAO);
    await pagina.setContent(
      `<!doctype html><html><body style="margin:0;width:${lado}px;height:${lado}px;background:${FUNDO_BRANCO};overflow:hidden;display:flex;align-items:center;justify-content:center"><img src="${dataUrl}" width="${largura}" height="${altura}" alt=""></body></html>`,
    );
    await pagina.evaluate(() => Promise.all([...document.images].map((imagem) => imagem.decode())));
    await pagina.screenshot({ path: path.join(publico, 'icons', arquivo), type: 'png' });
    await pagina.close();
  }
} finally {
  await navegador.close();
}
console.log('Gerados: public/favicon.svg (cópia do icone.svg oficial), icon-192.png, icon-512.png e maskable-512.png');
