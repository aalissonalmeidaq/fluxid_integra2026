import type { NomeDeCor } from '../tokens';

// Especificação visual: specs/003-design-system-telas/referencias/03-sistema-de-iconografia.png (RF-027 a RF-029).
export const NOMES_POR_GRUPO = {
  rastreabilidade: ['localizacao', 'rota', 'historico', 'geocerca', 'mapa', 'ultima-leitura'],
  seguranca: ['escudo', 'lacre', 'bloqueio', 'alerta', 'rompimento', 'verificado'],
  conectividade: ['antena', 'gps', 'rede', 'nuvem', 'sincronizar', 'sem-sinal'],
  'ativos-logistica': ['cilindro', 'sensor', 'caminhao', 'armazem', 'entrega', 'inventario'],
  sistema: ['dashboard', 'usuario', 'configuracoes', 'relatorios', 'filtros', 'notificacoes'],
} as const;

export type GrupoDeIcones = keyof typeof NOMES_POR_GRUPO;
export type IconName = (typeof NOMES_POR_GRUPO)[GrupoDeIcones][number];

export const TAMANHOS = [16, 24, 32, 48] as const;
export type IconSize = (typeof TAMANHOS)[number];

export const ESTADOS = ['padrao', 'ativo', 'desabilitado', 'erro'] as const;
export type IconState = (typeof ESTADOS)[number];

export const VARIANTES = ['contorno', 'duotone', 'monocromatica', 'negativa'] as const;
export type IconVariant = (typeof VARIANTES)[number];

// Cor de cada estado sobre fundo claro; todas com 3:1 ou mais contra branco e cinza-gelo (RF-029, CA-012).
export const COR_DO_ESTADO: Record<IconState, NomeDeCor> = {
  padrao: 'grafite',
  ativo: 'verde-escuro',
  desabilitado: 'borda-controle',
  erro: 'erro',
};

// Formas na grade de 24 por 24 px. Só comandos absolutos nos caminhos, para a área segura ser verificável.
// Formas com `apoio` são a camada de preenchimento da variante duotone; as demais formam o traço.
interface Base {
  apoio?: boolean;
}
export type Forma =
  | (Base & { t: 'path'; d: string })
  | (Base & { t: 'circle'; cx: number; cy: number; r: number })
  | (Base & { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number })
  | (Base & { t: 'line'; x1: number; y1: number; x2: number; y2: number })
  | (Base & { t: 'polyline'; pontos: string });

export type DesenhoDoGrupo<G extends GrupoDeIcones> = Record<(typeof NOMES_POR_GRUPO)[G][number], readonly Forma[]>;
