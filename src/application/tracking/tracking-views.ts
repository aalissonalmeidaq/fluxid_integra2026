// Views únicas do rastreamento (Spec 015, T016; RF-006). Mapa, lista, contadores e relatórios consomem a mesma coleção, de modo
// que não possam divergir; os componentes só apresentam o que chega aqui.
import type { Degradation, RuleLimits } from '@/domain/tracking/freshness';
import type {
  ComparisonResult, DegradationReason, EvaluationTiming, Freshness, InconclusiveReason, MeasureKind, PositionOrigin,
} from '@/domain/tracking/tracking-types';

// Posição como evidência: origem, instante observado e recebido, precisão e frescor. As coordenadas só existem para o mapa.
export interface TrackedPositionView {
  id: string;
  origin: PositionOrigin;
  subjectId: string;
  observedAt: string;
  receivedAt: string;
  confirmedAt: string | null;
  accuracyM: number | null;
  freshness: Freshness;
  retrospective: boolean;
  latitude: number;
  longitude: number;
}

// Uma origem de posição da viagem: o celular do motorista ou um lacre da carga.
export interface OriginView {
  key: string;
  origin: PositionOrigin;
  subjectId: string;
  label: string;
  freshness: Freshness;
  position: TrackedPositionView | null;
}

// Itens da cronologia: posição, intervalo sem evidência, evento operacional, comparação, presença pontual e degradação.
export type TimelineItem =
  | { kind: 'position'; id: string; occurredAt: string; position: TrackedPositionView }
  | { kind: 'gap'; id: string; occurredAt: string; endedAt: string | null; origin: PositionOrigin; subjectId: string }
  | { kind: 'event'; id: string; occurredAt: string; eventType: string; label: string }
  | { kind: 'comparison'; id: string; occurredAt: string; result: ComparisonResult; distanceM: number | null;
      reason: InconclusiveReason | null; timing: EvaluationTiming; ruleVersion: number }
  | { kind: 'presence'; id: string; occurredAt: string; cylinderId: string; source: 'camera' | 'nfc' | 'typed' }
  | { kind: 'degradation'; id: string; occurredAt: string; endedAt: string | null; reason: DegradationReason };

// Trecho contínuo do mapa: uma lacuna sempre separa trechos, nunca é desenhada como percurso (RF-020).
export interface MapSegment {
  id: string;
  origin: PositionOrigin;
  subjectId: string;
  positionIds: string[];
}

export interface CounterView {
  key: string;
  value: number | null;
  kind: MeasureKind;
  meaning: string;
}

// Linha da lista de viagens ativas: cada origem com seu frescor e a degradação em curso, se houver.
export interface ActiveTripRowView {
  tripId: string;
  tripNumber: number;
  startedAt: string;
  vehiclePlate: string;
  driverName: string;
  degradation: Degradation | null;
  origins: OriginView[];
  openOccurrences: number;
}

export interface ActiveTripsView {
  organizationId: string;
  generatedAt: string;
  rule: RuleLimits;
  rows: ActiveTripRowView[];
  counters: CounterView[];
  nextCursor: { at: string; id: string } | null;
}

export interface TrackingTimelineView {
  organizationId: string;
  generatedAt: string;
  rule: RuleLimits;
  trip: ActiveTripRowView;
  // Todas as posições recentes, de todas as origens, para o mapa e a lista.
  positions: TrackedPositionView[];
  items: TimelineItem[];
  segments: MapSegment[];
  counters: CounterView[];
}
