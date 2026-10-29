// Frescor das posições, degradação do acompanhamento e trechos do mapa (Spec 015, US1; RF-003, RF-007c, RF-020). Regras puras, com o
// "agora" e a regra vigente informados: nada é estimado e uma lacuna nunca é desenhada como percurso.
import type { DegradationReason, Freshness } from './tracking-types';

export interface RuleLimits {
  distanceM: number;
  maxAgeS: number;
  maxAccuracyM: number;
  version: number;
}

export interface PositionEvidence {
  observedAt: string;
  // Última vez que o lacre repetiu a mesma leitura; vale como confirmação de que a posição continua a mesma.
  confirmedAt?: string | null;
  accuracyM: number | null;
  // Posição antiga reenviada pelo lacre sem GPS no momento.
  lastKnown?: boolean;
}

// Diferença de relógio tolerada entre o aparelho e o servidor.
const CLOCK_SKEW_MS = 60_000;

export function freshnessOf(position: PositionEvidence | null, rule: RuleLimits, now: Date): Freshness {
  if (!position) return 'missing';
  const observed = Date.parse(position.observedAt);
  if (Number.isNaN(observed) || observed - now.getTime() > CLOCK_SKEW_MS) return 'inconclusive';
  if (position.accuracyM === null || position.accuracyM > rule.maxAccuracyM) return 'inconclusive';
  if (position.lastKnown) return 'delayed';
  const confirmed = position.confirmedAt ? Date.parse(position.confirmedAt) : Number.NaN;
  const reference = Number.isNaN(confirmed) ? observed : Math.max(observed, confirmed);
  return now.getTime() - reference <= rule.maxAgeS * 1000 ? 'current' : 'delayed';
}

export interface SessionState {
  status: 'active' | 'completed' | 'cancelled' | 'paused_auth_expired';
  capability: 'full' | 'foreground_only' | 'denied' | 'unavailable';
  capabilityChangedAt: string;
  notificationsDenied: boolean;
}

export interface Degradation {
  reason: DegradationReason;
  since: string;
}

// Sem sessão, o celular nunca começou a coletar nesta viagem: indisponível desde o início da viagem.
export function degradationOf(session: SessionState | null, tripStartedAt: string): Degradation | null {
  if (!session) return { reason: 'unavailable', since: tripStartedAt };
  const since = session.capabilityChangedAt;
  if (session.status === 'paused_auth_expired') return { reason: 'auth_expired', since };
  if (session.capability !== 'full') return { reason: session.capability, since };
  if (session.notificationsDenied) return { reason: 'notifications_denied', since };
  return null;
}

export interface TrailPoint {
  id: string;
  observedAt: string;
}

export interface Trail {
  // Ids em ordem cronológica de cada trecho contínuo.
  segments: string[][];
  // Intervalos sem evidência entre trechos.
  gaps: { from: string; to: string }[];
}

// Pontos mais distantes que o dobro da idade máxima da regra não são ligados.
export function segmentTrail(points: readonly TrailPoint[], rule: RuleLimits): Trail {
  const sorted = [...points].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.id.localeCompare(b.id));
  const segments: string[][] = [];
  const gaps: { from: string; to: string }[] = [];
  let previous: TrailPoint | null = null;
  for (const point of sorted) {
    if (!previous || Date.parse(point.observedAt) - Date.parse(previous.observedAt) > rule.maxAgeS * 2000) {
      if (previous) gaps.push({ from: previous.observedAt, to: point.observedAt });
      segments.push([point.id]);
    } else {
      segments[segments.length - 1]!.push(point.id);
    }
    previous = point;
  }
  return { segments, gaps };
}
