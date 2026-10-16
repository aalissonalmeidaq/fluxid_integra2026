export interface PosicaoDoSlide {
  // Topo e altura do slide, em pixels do documento.
  topo: number;
  altura: number;
}

// Folga de arredondamento das posições medidas no navegador.
const FOLGA = 2;

// Slide em que a pessoa está: o que ocupa o meio da tela. Antes do primeiro, o primeiro; sem slides, -1.
export function indiceDoSlide(slides: readonly PosicaoDoSlide[], rolagem: number, alturaDaTela: number): number {
  if (slides.length === 0) return -1;
  const meio = rolagem + alturaDaTela / 2;
  let indice = 0;
  slides.forEach((slide, posicao) => {
    if (slide.topo <= meio) indice = posicao;
  });
  return indice;
}

// Para onde vai o passo do teclado ou do indicador (1 avança, -1 volta). A mudança ocorre com um único clique,
// avançando diretamente para o próximo slide ou voltando para o anterior. Nas pontas, null.
export function destinoDoPasso(slides: readonly PosicaoDoSlide[], rolagem: number, alturaDaTela: number, direcao: 1 | -1): number | null {
  if (slides.length === 0) return null;
  const indice = indiceDoSlide(slides, rolagem, alturaDaTela);
  if (direcao === 1) {
    if (indice >= slides.length - 1) return null;
    return slides[indice + 1]!.topo;
  }
  // Voltando: se está consideravelmente abaixo do topo do slide atual (ex.: rolagem manual), volta ao topo dele; senão, vai ao anterior com um único clique.
  const atual = slides[indice]!;
  if (rolagem - atual.topo > FOLGA * 10) {
    return atual.topo;
  }
  if (indice <= 0) return null;
  return slides[indice - 1]!.topo;
}
