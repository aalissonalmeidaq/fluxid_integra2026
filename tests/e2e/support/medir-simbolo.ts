import type { Page } from '@playwright/test';

// Mede, no navegador, a legibilidade de um símbolo rasterizado: formas conectadas, cobertura e menor largura de forma.
// Recebe o PNG do símbolo (fundo uniforme) e, opcionalmente, a altura para a qual reduzi-lo antes de medir; a largura
// segue a proporção da imagem (o símbolo oficial não é quadrado).
//
// Forma relevante é um conjunto conectado de pixels com ao menos `areaMinimaDaForma` pixels. Pontos menores que isso
// (como os pontos da órbita do símbolo, que a 16 px têm menos de 1 px) são decoração que some na redução e não contam
// como forma, nem para a contagem nem para a menor largura.
export interface MedidasDoSimbolo {
  formas: number;
  formasRelevantes: number;
  cobertura: number;
  menorLargura: number;
}

export async function medirSimbolo(page: Page, png: Buffer, areaMinimaDaForma: number, reduzirPara?: number): Promise<MedidasDoSimbolo> {
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(
    async ({ url, lado, areaMinima }) => {
      const imagem = new Image();
      imagem.src = url;
      await imagem.decode();
      const altura = lado ?? imagem.naturalHeight;
      const largura = Math.round((imagem.naturalWidth * altura) / imagem.naturalHeight);
      const tela = document.createElement('canvas');
      tela.width = largura;
      tela.height = altura;
      const contexto = tela.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      contexto.imageSmoothingQuality = 'high';
      contexto.drawImage(imagem, 0, 0, largura, altura);
      const { data } = contexto.getImageData(0, 0, largura, altura);

      // Fundo = cor do canto; "tinta" = pixel suficientemente diferente do fundo.
      const fundo = [data[0] as number, data[1] as number, data[2] as number];
      const tinta = new Uint8Array(largura * altura);
      let total = 0;
      for (let i = 0; i < largura * altura; i += 1) {
        const distancia = Math.abs((data[i * 4] as number) - (fundo[0] as number)) + Math.abs((data[i * 4 + 1] as number) - (fundo[1] as number)) + Math.abs((data[i * 4 + 2] as number) - (fundo[2] as number));
        if (distancia > 150) {
          tinta[i] = 1;
          total += 1;
        }
      }

      // Rotulagem de componentes conectados (vizinhança de 4), com caixa delimitadora e área de cada um.
      const rotulo = new Int32Array(largura * altura);
      const formas: Array<{ minX: number; maxX: number; minY: number; maxY: number; area: number }> = [];
      for (let inicio = 0; inicio < tinta.length; inicio += 1) {
        if (!tinta[inicio] || rotulo[inicio]) continue;
        const id = formas.length + 1;
        const caixa = { minX: largura, maxX: 0, minY: altura, maxY: 0, area: 0 };
        const pilha = [inicio];
        rotulo[inicio] = id;
        while (pilha.length > 0) {
          const atual = pilha.pop() as number;
          const x = atual % largura;
          const y = Math.floor(atual / largura);
          caixa.area += 1;
          caixa.minX = Math.min(caixa.minX, x);
          caixa.maxX = Math.max(caixa.maxX, x);
          caixa.minY = Math.min(caixa.minY, y);
          caixa.maxY = Math.max(caixa.maxY, y);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue;
            const vizinho = ny * largura + nx;
            if (tinta[vizinho] && !rotulo[vizinho]) {
              rotulo[vizinho] = id;
              pilha.push(vizinho);
            }
          }
        }
        formas.push(caixa);
      }

      const relevantes = formas.filter((forma) => forma.area >= areaMinima);
      const menorLargura = Math.min(...relevantes.map((caixa) => Math.min(caixa.maxX - caixa.minX + 1, caixa.maxY - caixa.minY + 1)));
      return { formas: formas.length, formasRelevantes: relevantes.length, cobertura: total / (largura * altura), menorLargura };
    },
    { url: dataUrl, lado: reduzirPara ?? null, areaMinima: areaMinimaDaForma },
  );
}
