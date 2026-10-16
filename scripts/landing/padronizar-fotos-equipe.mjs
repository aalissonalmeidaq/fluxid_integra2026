// Padroniza as fotos da equipe da landing (Spec 011, polimento de 16/10/2026) a partir das originais guardadas na spec:
//   node scripts/landing/padronizar-fotos-equipe.mjs
// As originais chegaram com fundos diferentes (branco e preto), enquadramentos diferentes e em tamanho pequeno (163 a 326 px). Aqui cada
// foto ganha o mesmo enquadramento (o rosto com a mesma largura e os olhos na mesma altura), o mesmo fundo (degradê claro da marca, no
// lugar do fundo original, só na região ligada às bordas, para não apagar o branco dos olhos nem reflexos dos óculos) e duas larguras
// (192 e 384 px), ampliadas com interpolação de qualidade e nitidez leve. Ampliar não cria detalhe: com fotos originais maiores (512 px ou
// mais), o resultado fica mais nítido. Sem dependência nova: usa o Chromium que o Playwright já instala.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGEM = join(RAIZ, 'specs', '011-landing-page-institucional', 'assets', 'equipe');
const DESTINO = join(RAIZ, 'public', 'landing', 'equipe');
const LARGURAS = [192, 384];

// Rosto de cada foto, em fração da original: centro horizontal, altura dos olhos e largura do rosto. O fundo é a cor que a foto trazia.
const FOTOS = [
  { id: 'nata-baracho', rosto: { x: 0.49, olhos: 0.36, largura: 0.4 }, fundo: [255, 255, 255] },
  { id: 'carlos-augusto', rosto: { x: 0.5, olhos: 0.4, largura: 0.38 }, fundo: [0, 0, 0] },
  { id: 'john-walter', rosto: { x: 0.5, olhos: 0.5, largura: 0.38 }, fundo: [255, 255, 255] },
  { id: 'simao-bastos', rosto: { x: 0.44, olhos: 0.38, largura: 0.33 }, fundo: [255, 255, 255] },
  { id: 'kauan-evangelista', rosto: { x: 0.51, olhos: 0.37, largura: 0.38 }, fundo: [255, 255, 255] },
];

// No quadro final: o rosto ocupa 38% da largura e os olhos ficam a 41% da altura (retrato de crachá, com ombros).
const ALVO = { largura: 0.38, olhos: 0.41 };
// Degradê do fundo novo: info-fundo no alto, branco embaixo (tokens do design system).
const FUNDO = { alto: '#E8F1FC', baixo: '#FFFFFF' };

function processar({ dados, rosto, fundo, alvo, cores, lado }) {
  return new Promise((resolve, reject) => {
    const imagem = new Image();
    imagem.onerror = reject;
    imagem.onload = () => {
      const w = imagem.naturalWidth;
      const h = imagem.naturalHeight;
      // 1. Máscara do fundo: pixels perto da cor do fundo, ligados às bordas (preenchimento a partir das bordas).
      const fonte = document.createElement('canvas');
      fonte.width = w;
      fonte.height = h;
      const cf = fonte.getContext('2d');
      cf.drawImage(imagem, 0, 0);
      const px = cf.getImageData(0, 0, w, h);
      const d = px.data;
      const distancia = (i) => Math.hypot(d[i] - fundo[0], d[i + 1] - fundo[1], d[i + 2] - fundo[2]);
      const LIMITE = fundo[0] > 128 ? 46 : 34;
      const SUAVE = fundo[0] > 128 ? 26 : 16;
      const eFundo = new Uint8Array(w * h);
      const fila = [];
      for (let x = 0; x < w; x += 1) fila.push(x, (h - 1) * w + x);
      for (let y = 0; y < h; y += 1) fila.push(y * w, y * w + w - 1);
      while (fila.length) {
        const p = fila.pop();
        if (eFundo[p] || distancia(p * 4) > LIMITE) continue;
        eFundo[p] = 1;
        const x = p % w;
        const y = (p - x) / w;
        if (x > 0) fila.push(p - 1);
        if (x < w - 1) fila.push(p + 1);
        if (y > 0) fila.push(p - w);
        if (y < h - 1) fila.push(p + w);
      }
      // Alfa: fundo transparente, borda suavizada pela distância de cor e por um desfoque de 1 px da máscara.
      const alfa = new Float32Array(w * h);
      for (let p = 0; p < w * h; p += 1) {
        alfa[p] = eFundo[p] ? Math.min(1, Math.max(0, (distancia(p * 4) - (LIMITE - SUAVE)) / SUAVE)) : 1;
      }
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          let soma = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            soma += alfa[yy * w + xx];
            n += 1;
          }
          d[(y * w + x) * 4 + 3] = Math.round((Math.min(alfa[y * w + x], soma / n)) * 255);
        }
      }
      cf.putImageData(px, 0, 0);

      // 2. Enquadramento: o quadrado da original que deixa o rosto na largura e na altura de olhos do alvo.
      // Sem passar da borda de baixo da original: ali o ombro acaba e sobraria uma faixa de fundo (estender a última linha cria listras).
      // Nesse caso o quadro aproxima um pouco (a foto do John, mais curta embaixo).
      const ladoNaOrigem = Math.min((rosto.largura * w) / alvo.largura, (h - rosto.olhos * h) / (1 - alvo.olhos));
      const x0 = rosto.x * w - ladoNaOrigem / 2;
      const y0 = rosto.olhos * h - alvo.olhos * ladoNaOrigem;
      const saida = document.createElement('canvas');
      saida.width = lado;
      saida.height = lado;
      const cs = saida.getContext('2d');
      const degrade = cs.createLinearGradient(0, 0, 0, lado);
      degrade.addColorStop(0, cores.alto);
      degrade.addColorStop(1, cores.baixo);
      cs.fillStyle = degrade;
      cs.fillRect(0, 0, lado, lado);
      cs.imageSmoothingEnabled = true;
      cs.imageSmoothingQuality = 'high';
      const escala = lado / ladoNaOrigem;
      cs.drawImage(fonte, -x0 * escala, -y0 * escala, w * escala, h * escala);

      // 3. Nitidez leve (máscara de nitidez 3 x 3, 35%), só onde há imagem.
      const final = cs.getImageData(0, 0, lado, lado);
      const f = final.data;
      const copia = new Uint8ClampedArray(f);
      const QUANTO = 0.35;
      for (let y = 1; y < lado - 1; y += 1) {
        for (let x = 1; x < lado - 1; x += 1) {
          const i = (y * lado + x) * 4;
          for (let c = 0; c < 3; c += 1) {
            const vizinhos = copia[i - 4 + c] + copia[i + 4 + c] + copia[i - lado * 4 + c] + copia[i + lado * 4 + c];
            f[i + c] = copia[i + c] + QUANTO * (4 * copia[i + c] - vizinhos);
          }
        }
      }
      cs.putImageData(final, 0, 0);
      saida.toBlob((blob) => blob.arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let texto = '';
        for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        resolve(btoa(texto));
      }), 'image/webp', 0.9);
    };
    imagem.src = dados;
  });
}

mkdirSync(DESTINO, { recursive: true });
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.setContent('<!doctype html><title>fotos</title>');
for (const foto of FOTOS) {
  const dados = `data:image/png;base64,${readFileSync(join(ORIGEM, `${foto.id}.png`)).toString('base64')}`;
  for (const lado of LARGURAS) {
    const base64 = await pagina.evaluate(processar, { dados, rosto: foto.rosto, fundo: foto.fundo, alvo: ALVO, cores: FUNDO, lado });
    const arquivo = lado === Math.max(...LARGURAS) ? `${foto.id}.webp` : `${foto.id}-${lado}.webp`;
    const bytes = Buffer.from(base64, 'base64');
    writeFileSync(join(DESTINO, arquivo), bytes);
    console.log(`${arquivo}: ${lado} px, ${(bytes.length / 1024).toFixed(1)} KB`);
  }
}
await navegador.close();
