// Portas do rastreamento (Spec 015, T015). O domínio e os serviços conversam com a plataforma (geolocalização web ou nativa), com a
// fila local e com o servidor só por estas interfaces; o relógio é injetado para que janela offline e frescor sejam testáveis.
import type { DegradationReason, TrackingError } from '@/domain/tracking/tracking-types';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

// --- Coleta de posição -----------------------------------------------------------------------------------------------------------

export type TrackingPlatform = 'android_native' | 'web_visible';
export type TrackingCapability = 'full' | 'foreground_only' | 'denied' | 'unavailable';

export interface CollectedPosition {
  observedAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
}

export interface LocationTrackingState {
  platform: TrackingPlatform;
  capability: TrackingCapability;
  collecting: boolean;
  // Presente quando a coleta não está completa (RF-007c).
  degradation: DegradationReason | null;
}

export interface LocationTrackingPort {
  state(): LocationTrackingState;
  // Começa a coleta com o intervalo preferencial; a plataforma pode entregar com atraso, nunca com intervalo exato prometido.
  start(options: { intervalSeconds: number }): Promise<LocationTrackingState>;
  stop(): Promise<void>;
  onPosition(listener: (position: CollectedPosition) => void): () => void;
  onStateChange(listener: (state: LocationTrackingState) => void): () => void;
}

// --- Fila local ------------------------------------------------------------------------------------------------------------------

// Dono imutável de cada item: nunca é enviado em outro contexto (RF-007d, casos extremos).
export interface QueueOwner {
  userId: string;
  organizationId: string;
  endpointId: string;
  tripId: string;
  trackingSessionId: string;
}

export interface QueuedPosition extends CollectedPosition {
  clientPositionId: string;
  sequenceNo: number;
  owner: QueueOwner;
}

export interface TrackingQueuePort {
  enqueue(owner: QueueOwner, position: CollectedPosition): Promise<QueuedPosition | 'full'>;
  // Próximo lote do mesmo dono, em ordem de sequência.
  nextBatch(owner: QueueOwner, limit: number): Promise<QueuedPosition[]>;
  // Remove só itens confirmados pelo servidor (gravados ou duplicados).
  remove(owner: QueueOwner, clientPositionIds: string[]): Promise<void>;
  count(owner: QueueOwner): Promise<number>;
  owners(): Promise<QueueOwner[]>;
}

// --- Servidor --------------------------------------------------------------------------------------------------------------------

// Chamada às Edge Functions do rastreamento no destino ativo. Uma conexão por vez; nenhuma troca de destino por erro de negócio.
export type TrackingFunction = 'query-tracking' | 'manage-tracking';

export interface TrackingTransport {
  call(fn: TrackingFunction, body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type GatewayResult<T> = { ok: true; value: T } | { ok: false; error: TrackingError | 'OFFLINE' };

export interface IngestItemResult {
  clientPositionId: string;
  status: 'stored' | 'duplicate' | 'rejected';
  retrospective: boolean;
  code?: string;
}

export interface TrackingSessionGrant {
  trackingSessionId: string;
  collectUntil: string;
  intervalSeconds: number;
  status: 'active' | 'completed' | 'cancelled' | 'paused_auth_expired';
}

export interface TrackingGateway {
  startSession(input: { organizationId: string; tripId: string; deviceInstallationId: string; platform: TrackingPlatform;
    capability: TrackingCapability; notificationsDenied: boolean; requestId: string }): Promise<GatewayResult<TrackingSessionGrant>>;
  ingest(input: { organizationId: string; trackingSessionId: string; deviceInstallationId: string; positions: QueuedPosition[] }):
    Promise<GatewayResult<{ serverTime: string; results: IngestItemResult[] }>>;
  endSession(input: { organizationId: string; trackingSessionId: string; reason: 'completed' | 'cancelled'; requestId: string }):
    Promise<GatewayResult<TrackingSessionGrant>>;
  reportCapability(input: { organizationId: string; trackingSessionId: string; capability: TrackingCapability; notificationsDenied: boolean;
    requestId: string }): Promise<GatewayResult<null>>;
}
