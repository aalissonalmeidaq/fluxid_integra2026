export interface PosicaoDaSecao {
  id: string;
  // Topo da seção, na mesma referência da linha de leitura (pixels a partir do topo da janela).
  topo: number;
}

// Seção em que a pessoa está (layout de 15/10/2026): a de topo mais baixo entre as que já passaram da linha de leitura. Antes da primeira
// seção do menu, na abertura, nenhuma é marcada.
export function secaoAtual(posicoes: readonly PosicaoDaSecao[], linhaDeLeitura: number): string | null {
  let atual: PosicaoDaSecao | null = null;
  for (const posicao of posicoes) {
    if (posicao.topo <= linhaDeLeitura && (atual === null || posicao.topo > atual.topo)) atual = posicao;
  }
  return atual?.id ?? null;
}
