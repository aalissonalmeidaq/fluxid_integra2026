// Tipos dos blocos da Visão geral (Spec 005). Só tipos e regras de estado: nenhum número nem texto de exemplo vive aqui (RF-017).

export const OVERVIEW_BLOCK_IDS = ['indicadores', 'mapa', 'movimentacao', 'situacao', 'alertas', 'cilindros', 'desempenho'] as const;

export type OverviewBlockId = (typeof OVERVIEW_BLOCK_IDS)[number];

// Ícones do catálogo da Spec 003 usados pelos cartões; a página os traduz para o componente de ícone.
export type OverviewIcon = 'cilindro' | 'rota' | 'alerta' | 'lacre';

// Tom do cartão: cada tipo de KPI tem uma cor própria, sempre acompanhada de ícone e rótulo (a cor nunca é a única informação).
export type IndicatorTone = 'cadastro' | 'viagem' | 'critico' | 'sucesso';

export interface IndicatorItem {
  id: string;
  icon: OverviewIcon;
  tone: IndicatorTone;
  label: string;
  value: string;
  note: string;
}

export interface SeriesDefinition {
  id: string;
  label: string;
}

export interface MovementDay {
  label: string;
  values: Record<string, number>;
}

export interface StatusCategory {
  id: string;
  label: string;
  value: number;
  percent: number;
}

export type AlertSeverity = 'critico' | 'atencao' | 'informativo';

export interface AlertItem {
  id: string;
  text: string;
  type: string;
  when: string;
  // Alerta que acabou de ser disparado: recebe o destaque "Novo".
  isNew: boolean;
  severity: AlertSeverity;
  cylinderId: string;
  occurrence: string;
  status: string;
}

export interface CylinderItem {
  id: string;
  gas: string;
  status: string;
}

export interface PerformanceItem {
  id: string;
  label: string;
  value: string;
  unit: string;
}

export interface OverviewContentMap {
  indicadores: { items: IndicatorItem[] };
  // `center` é o ponto de exemplo em que o mapa abre e `span` a largura da caixa em graus.
  mapa: { message: string; center: { latitude: number; longitude: number; span: number } };
  movimentacao: { series: SeriesDefinition[]; days: MovementDay[] };
  situacao: { total: number; categories: StatusCategory[] };
  alertas: { items: AlertItem[] };
  cilindros: { items: CylinderItem[] };
  desempenho: { items: PerformanceItem[] };
}

export type OverviewBlockState<T = unknown> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty' }
  | { status: 'error' };

// O conteúdo vazio vira o estado `empty`: lista sem itens, série sem dias ou rosca sem categorias. O mapa é só um espaço
// reservado e nunca fica vazio.
export function isEmptyContent<K extends OverviewBlockId>(id: K, content: OverviewContentMap[K]): boolean {
  const dados = content as unknown as { items?: unknown[]; days?: unknown[]; categories?: unknown[] };
  if (id === 'mapa') return false;
  if (id === 'movimentacao') return (dados.days?.length ?? 0) === 0;
  if (id === 'situacao') return (dados.categories?.length ?? 0) === 0;
  return (dados.items?.length ?? 0) === 0;
}
