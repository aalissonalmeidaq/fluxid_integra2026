// Recorta as logos institucionais da landing (Spec 011, pedido de 15/10/2026) a partir da folha enviada pela pessoa responsável.
//
// Sem dependência nova: usa o Chromium que o Playwright já instala. A folha tem fundo transparente, mas a logo da Saga veio colada sobre
// branco: em todas, o branco vira transparência (a cor de cada pixel é separada do branco) e o recorte é ajustado ao contorno. As versões
// brancas da folha ficam de fora: estão incompletas. O resultado é versionado em
// public/landing/instituicoes/ e este script é só a receita para refazê-lo:
//
//   node scripts/landing/recortar-logos-senai.mjs
//
// Entrada: specs/011-landing-page-institucional/assets/logos-senai-original.png (1920 x 1080, logos coloridas sobre transparência).
// Saída: integra-senai.webp, senai-ceara.webp e saga-senai-inovacao.webp, com as dimensões impressas no fim (vão para landing-content.ts).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGEM = join(RAIZ, 'specs', '011-landing-page-institucional', 'assets', 'logos-senai-original.png');
const DESTINO = join(RAIZ, 'public', 'landing', 'instituicoes');

// Áreas de cada logo na folha (x, y, largura, altura), com folga; o contorno exato é achado pela transparência.
const LOGOS = [
  { nome: 'integra-senai', area: [160, 200, 360, 185] },
  { nome: 'senai-ceara', area: [140, 430, 330, 150] },
  { nome: 'saga-senai-inovacao', area: [1250, 240, 560, 210] },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const folha = `data:image/png;base64,${readFileSync(ORIGEM).toString('base64')}`;
mkdirSync(DESTINO, { recursive: true });

for (const logo of LOGOS) {
  const resultado = await pagina.evaluate(async ({ folha, area }) => {
    const imagem = new Image();
    imagem.src = folha;
    await imagem.decode();
    const [x, y, largura, altura] = area;
    const tela = new OffscreenCanvas(largura, altura);
    const contexto = tela.getContext('2d');
    contexto.drawImage(imagem, x, y, largura, altura, 0, 0, largura, altura);
    const dados = contexto.getImageData(0, 0, largura, altura);
    const px = dados.data;
    let [minX, minY, maxX, maxY] = [largura, altura, -1, -1];
    for (let i = 0; i < px.length; i += 4) {
      // Separa a cor do branco: o novo alfa é o quanto o pixel se afasta do branco no canal mais distante, vezes o alfa que ele já tinha.
      // Nas logos que já vêm transparentes isso não muda nada visível; na da Saga, colada sobre branco, o fundo some sem serrilhar a borda.
      const branco = Math.max(255 - px[i], 255 - px[i + 1], 255 - px[i + 2]) / 255;
      const alfa = (branco * px[i + 3]) / 255;
      if (alfa < 0.04) {
        px[i + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c += 1) px[i + c] = Math.round(Math.min(255, Math.max(0, 255 - (255 - px[i + c]) / branco)));
      px[i + 3] = Math.round(alfa * 255);
      const p = i / 4;
      const [px0, py0] = [p % largura, Math.floor(p / largura)];
      minX = Math.min(minX, px0);
      minY = Math.min(minY, py0);
      maxX = Math.max(maxX, px0);
      maxY = Math.max(maxY, py0);
    }
    contexto.putImageData(dados, 0, 0);
    const [w, h] = [maxX - minX + 1, maxY - minY + 1];
    const recorte = new OffscreenCanvas(w, h);
    recorte.getContext('2d').drawImage(tela, minX, minY, w, h, 0, 0, w, h);
    const blob = await recorte.convertToBlob({ type: 'image/webp', quality: 0.92 });
    return { largura: w, altura: h, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
  }, { folha, area: logo.area });
  writeFileSync(join(DESTINO, `${logo.nome}.webp`), Buffer.from(resultado.bytes));
  console.log(`${logo.nome}: ${resultado.largura} x ${resultado.altura}, ${(resultado.bytes.length / 1024).toFixed(1)} KB`);
}

await navegador.close();
