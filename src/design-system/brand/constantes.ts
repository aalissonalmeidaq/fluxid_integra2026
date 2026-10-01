// Constantes da marca (prancha de variações da marca e arquivos oficiais em ./oficial).
export const TAMANHOS_DO_SIMBOLO = [256, 64, 32, 16] as const;
export type TamanhoDoSimbolo = (typeof TAMANHOS_DO_SIMBOLO)[number];

// Proporção largura/altura do arquivo oficial icone.svg (viewBox 104 por 126).
export const PROPORCAO_DO_SIMBOLO = 104 / 126;

// Redução mínima digital da prancha de proteção e redução: 120 px de largura (RF-026).
export const LARGURA_MINIMA_DIGITAL = 120;
