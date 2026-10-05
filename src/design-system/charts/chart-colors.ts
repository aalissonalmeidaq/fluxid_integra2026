// Cores dos gráficos: só tokens da Spec 003 com 3:1 ou mais contra o fundo branco. O `alerta-faixa` e as cores só decorativas
// ficam de fora. A cor nunca é a única informação: cada série ou fatia também tem traçado, marcador ou padrão próprio (RF-018).
export const CORES_DOS_GRAFICOS = ['navy', 'azul-royal', 'ciano-acessivel', 'verde-acessivel'] as const;

export type CorDoGrafico = (typeof CORES_DOS_GRAFICOS)[number];

export function corDoGrafico(indice: number): string {
  return `var(--color-${CORES_DOS_GRAFICOS[indice % CORES_DOS_GRAFICOS.length]})`;
}

export const numeroPtBr = new Intl.NumberFormat('pt-BR');
