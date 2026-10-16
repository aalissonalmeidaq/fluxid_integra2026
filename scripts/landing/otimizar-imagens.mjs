// Gera as versões otimizadas do mascote da landing page (Spec 011, T040 e adaptação ao pitch) a partir das artes guardadas na spec.
//
// Sem dependência nova: a conversão usa o Chromium que o Playwright já instala (canvas.toBlob em WebP, com transparência). O resultado é
// versionado em public/landing/ e este script é só a receita para refazê-lo (por exemplo, se a arte mudar):
//
//   node scripts/landing/otimizar-imagens.mjs
//
// Entradas (specs/011-landing-page-institucional/assets/): mascote-recorte.png (o mascote sem fundo, para ficar nítido sobre qualquer
// seção), mascote-rosto.png (gerado por scripts/landing/poses-do-mascote.py) e as poses extraídas da apresentação.
// Saídas em public/landing/: mascote-{480,768,1200} (corpo inteiro, 2:3), mascote-rosto-{160,320} (1:1) e as poses da apresentação (preocupado,
// procurando, tablet, cilindro e indicando) com o dispositivo instalado no cilindro.
// O limite do orçamento é de 250 KB para as imagens da primeira dobra (RNF-005): o script falha se a versão de 768 px passar disso.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = join(RAIZ, 'specs', '011-landing-page-institucional', 'assets');
const DESTINO = join(RAIZ, 'public', 'landing');
const QUALIDADE = 0.86;
const LIMITE_PRIMEIRA_DOBRA = 250 * 1024;

const POSES = [
  { origem: 'mascote-recorte.png', nome: 'mascote', larguras: [480, 768, 1200] },
  { origem: 'mascote-rosto.png', nome: 'mascote-rosto', larguras: [160, 320] },
  // Poses da apresentação do FluxID (IntegraSENAI), já sem fundo e recortadas ao contorno. Nunca ampliadas além do tamanho da arte.
  { origem: 'mascote-preocupado.png', nome: 'mascote-preocupado', larguras: [240, 303] },
  { origem: 'mascote-procurando.png', nome: 'mascote-procurando', larguras: [240, 323] },
  { origem: 'mascote-tablet.png', nome: 'mascote-tablet', larguras: [320, 588] },
  { origem: 'mascote-cilindro.png', nome: 'mascote-cilindro', larguras: [320, 400, 749] },
  { origem: 'mascote-indicando.png', nome: 'mascote-indicando', larguras: [240, 464] },
  { origem: 'dispositivo-no-cilindro.png', nome: 'dispositivo-no-cilindro', larguras: [240, 373] },
];

mkdirSync(DESTINO, { recursive: true });

const navegador = await chromium.launch();
try {
  const pagina = await navegador.newPage();
  for (const pose of POSES) {
    const original = `data:image/png;base64,${readFileSync(join(ASSETS, pose.origem)).toString('base64')}`;
    for (const largura of pose.larguras) {
      const base64 = await pagina.evaluate(
        async ({ dados, largura: alvo, qualidade }) => {
          const imagem = new Image();
          imagem.src = dados;
          await imagem.decode();
          const altura = Math.round((imagem.naturalHeight * alvo) / imagem.naturalWidth);
          const tela = document.createElement('canvas');
          tela.width = alvo;
          tela.height = altura;
          const contexto = tela.getContext('2d');
          contexto.imageSmoothingQuality = 'high';
          contexto.drawImage(imagem, 0, 0, alvo, altura);
          const blob = await new Promise((resolve) => tela.toBlob(resolve, 'image/webp', qualidade));
          const buffer = new Uint8Array(await blob.arrayBuffer());
          let texto = '';
          for (let i = 0; i < buffer.length; i += 0x8000) texto += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
          return btoa(texto);
        },
        { dados: original, largura, qualidade: QUALIDADE },
      );
      const bytes = Buffer.from(base64, 'base64');
      const arquivo = join(DESTINO, `${pose.nome}-${largura}.webp`);
      writeFileSync(arquivo, bytes);
      console.log(`${arquivo}: ${(bytes.length / 1024).toFixed(1)} KB`);
      if (pose.nome === 'mascote' && largura === 768 && bytes.length > LIMITE_PRIMEIRA_DOBRA) {
        throw new Error('A imagem de 768 px passa do orçamento de 250 KB da primeira dobra.');
      }
    }
  }

  // Versão da captura da viagem para a abertura (o maior elemento da primeira tela, LCP): o mesmo recorte do topo em 16:9 que a abertura
  // mostra (object-position: top), em 640 x 360, leve o bastante para o index.html pré-carregá-la sem atrasar o JavaScript.
  const telaOriginal = `data:image/webp;base64,${readFileSync(join(DESTINO, 'telas', 'tela-viagem-desktop.webp')).toString('base64')}`;
  const telaHero = await pagina.evaluate(
    async ({ dados, qualidade }) => {
      const imagem = new Image();
      imagem.src = dados;
      await imagem.decode();
      const recorteAltura = Math.round((imagem.naturalWidth * 9) / 16);
      const tela = document.createElement('canvas');
      tela.width = 640;
      tela.height = 360;
      const contexto = tela.getContext('2d');
      contexto.imageSmoothingQuality = 'high';
      contexto.drawImage(imagem, 0, 0, imagem.naturalWidth, recorteAltura, 0, 0, 640, 360);
      const blob = await new Promise((resolve) => tela.toBlob(resolve, 'image/webp', qualidade));
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let texto = '';
      for (let i = 0; i < buffer.length; i += 0x8000) texto += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      return btoa(texto);
    },
    { dados: telaOriginal, qualidade: 0.8 },
  );
  const bytesHero = Buffer.from(telaHero, 'base64');
  writeFileSync(join(DESTINO, 'telas', 'tela-viagem-hero.webp'), bytesHero);
  console.log(`tela-viagem-hero.webp: ${(bytesHero.length / 1024).toFixed(1)} KB`);
} finally {
  await navegador.close();
}
