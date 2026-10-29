// Regra de proximidade celular × lacre (Spec 015, US2; RF-008 a RF-012, RF-007e, RF-007f). Pura e determinística: o banco aplica a
// mesma regra na transação de ingestão, e esta versão serve à interface (validação da regra, explicação das comparações) e aos testes.
import type { RuleLimits } from './freshness';
import type { ComparisonResult, EvaluationTiming } from './tracking-types';

export const DEFAULT_RULE: RuleLimits = { distanceM: 100, maxAgeS: 120, maxAccuracyM: 50, version: 0 };

// Faixas que a empresa pode configurar (RF-009). Valores inteiros, como no formulário.
export const RULE_RANGES = {
  distance_m: { min: 50, max: 500 },
  max_age_s: { min: 60, max: 300 },
  max_accuracy_m: { min: 20, max: 100 },
} as const;

export function validateRule(rule: { distanceM: number; maxAgeS: number; maxAccuracyM: number }): { field: keyof typeof RULE_RANGES; message: string }[] {
  const values = { distance_m: rule.distanceM, max_age_s: rule.maxAgeS, max_accuracy_m: rule.maxAccuracyM };
  const errors: { field: keyof typeof RULE_RANGES; message: string }[] = [];
  for (const field of Object.keys(RULE_RANGES) as (keyof typeof RULE_RANGES)[]) {
    const { min, max } = RULE_RANGES[field];
    const value = values[field];
    if (!Number.isInteger(value) || value < min || value > max) errors.push({ field, message: `Use um número inteiro entre ${min} e ${max}.` });
  }
  return errors;
}

export interface GpsReading {
  id: string;
  observedAt: string;
  // Última vez que o lacre repetiu a mesma leitura.
  confirmedAt?: string | null;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
}

// Raio médio da Terra (m), o mesmo valor que o PostGIS usa na esfera.
const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type ComparisonReason = 'within_limit' | 'beyond_limit' | 'seal_missing' | 'stale' | 'imprecise' | 'future';

export interface Comparison {
  result: ComparisonResult;
  reason: ComparisonReason;
  distanceM: number | null;
}

// Diferença de relógio tolerada entre o lacre e o celular.
const CLOCK_SKEW_MS = 60_000;

// Compara a posição do celular com a posição do lacre mais próxima no tempo. O instante de referência é o do celular, nunca o "agora":
// uma avaliação feita depois (retrospectiva) decide pelo que valia no momento observado.
export function compare(mobile: GpsReading, seal: GpsReading | null, rule: RuleLimits): Comparison {
  if (!seal) return { result: 'inconclusive', reason: 'seal_missing', distanceM: null };
  const reference = Date.parse(mobile.observedAt);
  const sealObserved = Date.parse(seal.observedAt);
  const sealConfirmed = seal.confirmedAt ? Date.parse(seal.confirmedAt) : Number.NaN;
  const sealLatest = Number.isNaN(sealConfirmed) ? sealObserved : Math.max(sealObserved, sealConfirmed);
  if (sealObserved - reference > CLOCK_SKEW_MS) return { result: 'inconclusive', reason: 'future', distanceM: null };
  if (reference - sealLatest > rule.maxAgeS * 1000) return { result: 'inconclusive', reason: 'stale', distanceM: null };
  const imprecise = (accuracy: number | null) => accuracy === null || accuracy > rule.maxAccuracyM;
  if (imprecise(mobile.accuracyM) || imprecise(seal.accuracyM)) return { result: 'inconclusive', reason: 'imprecise', distanceM: null };
  const distance = Math.round(distanceM(mobile, seal) * 100) / 100;
  return distance > rule.distanceM
    ? { result: 'outside', reason: 'beyond_limit', distanceM: distance }
    : { result: 'inside', reason: 'within_limit', distanceM: distance };
}

export interface StreakState {
  outsideStreak: number;
  occurrenceOpen: boolean;
}

// Máquina das três comparações (RF-010 a RF-012, RF-014): outside soma, inside zera, inconclusiva não muda. A terceira outside
// consecutiva confirma, uma só vez enquanto a ocorrência estiver aberta.
export const STREAK_TO_CONFIRM = 3;

export function advanceStreak(state: StreakState, result: ComparisonResult): { state: StreakState; confirm: boolean } {
  if (result === 'inconclusive') return { state, confirm: false };
  if (result === 'inside') return { state: { ...state, outsideStreak: 0 }, confirm: false };
  const outsideStreak = state.outsideStreak + 1;
  const confirm = !state.occurrenceOpen && outsideStreak >= STREAK_TO_CONFIRM;
  return { state: { outsideStreak, occurrenceOpen: state.occurrenceOpen || confirm }, confirm };
}

// Uma posição recebida depois da idade máxima foi avaliada depois do fato (retrospectiva); com a viagem encerrada, só vira histórico.
export function timingOf(position: { observedAt: string; receivedAt: string }, rule: RuleLimits, tripActive: boolean): EvaluationTiming {
  if (!tripActive) return 'historical_only';
  return Date.parse(position.receivedAt) - Date.parse(position.observedAt) > rule.maxAgeS * 1000 ? 'retrospective' : 'realtime';
}
