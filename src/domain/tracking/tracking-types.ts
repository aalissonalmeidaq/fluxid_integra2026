// Vocabulário comum do rastreamento (Spec 015): origem da posição, frescor, validade da comparação, retrospectividade, erros e
// cursor. Mapa, lista, contadores e relatórios usam estes tipos; nenhuma regra mora no React.

// De onde veio a posição: o celular do motorista ou o lacre do cilindro (RF-002).
export const POSITION_ORIGINS = ['mobile', 'seal'] as const;
export type PositionOrigin = (typeof POSITION_ORIGINS)[number];

// Condição de atualização de uma origem (RF-003): nunca se estima uma posição inexistente.
export const FRESHNESS = ['current', 'delayed', 'missing', 'inconclusive'] as const;
export type Freshness = (typeof FRESHNESS)[number];

// Resultado de uma comparação celular × lacre (RF-008, RF-012): inconclusiva não conta a favor nem contra.
export const COMPARISON_RESULTS = ['inside', 'outside', 'inconclusive'] as const;
export type ComparisonResult = (typeof COMPARISON_RESULTS)[number];

export const INCONCLUSIVE_REASONS = ['missing_mobile', 'missing_seal', 'stale', 'inaccurate', 'future', 'context_mismatch'] as const;
export type InconclusiveReason = (typeof INCONCLUSIVE_REASONS)[number];

// Avaliação em tempo real ou feita depois, com posições sincronizadas com atraso (RF-007e, RF-007f).
export const EVALUATION_TIMING = ['realtime', 'retrospective', 'historical_only'] as const;
export type EvaluationTiming = (typeof EVALUATION_TIMING)[number];

// Por que o acompanhamento está degradado (RF-007c), visível ao motorista e ao gestor.
export const DEGRADATION_REASONS = ['denied', 'foreground_only', 'unavailable', 'notifications_denied', 'auth_expired'] as const;
export type DegradationReason = (typeof DEGRADATION_REASONS)[number];

// Natureza de um número mostrado (RF-042).
export const MEASURE_KINDS = ['measured', 'aggregated', 'unavailable', 'inconclusive'] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];

// Estados que podem ser filtrados: da viagem/sessão e da ocorrência.
export const TRACKING_STATUSES = ['active', 'completed', 'cancelled', 'open', 'acknowledged', 'closed'] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

// Códigos de erro sanitizados devolvidos pelo servidor; nunca ecoam coordenadas.
export const TRACKING_ERRORS = ['AUTH_REQUIRED', 'ACCESS_DENIED', 'NOT_FOUND', 'VALIDATION_FAILED', 'CONFLICT', 'UNAVAILABLE'] as const;
export type TrackingError = (typeof TRACKING_ERRORS)[number];

// Posição do cursor estável: ordem por instante e, no empate, pelo id (RF-021).
export interface TrackingCursor {
  occurredAt: string;
  id: string;
}

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
