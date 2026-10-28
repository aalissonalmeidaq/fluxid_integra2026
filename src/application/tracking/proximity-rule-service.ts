// Regra de proximidade (Spec 015, T041d; RF-009, RF-009a) sobre `query-tracking` e `manage-tracking`. As faixas e a justificativa são
// conferidas aqui antes do envio (o banco confere de novo e decide a permissão); a resposta vira estado de tela. Fora do React.
import { validateRule } from '@/domain/tracking/proximity-evaluator';
import type { TrackingTransport } from './tracking-ports';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : typeof value === 'string' && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

export interface ProximityRuleView {
  version: number;
  distanceM: number;
  maxAgeS: number;
  maxAccuracyM: number;
  validFrom: string | null;
}

export type RuleOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'invalid'; fields: Record<string, string> }
  | { kind: 'offline' | 'unavailable' | 'unknown' | 'session_expired' | 'access_denied' };

function toRule(raw: unknown): ProximityRuleView | null {
  if (!isObject(raw)) return null;
  const version = num(raw.version);
  const distanceM = num(raw.distance_m);
  const maxAgeS = num(raw.max_age_s);
  const maxAccuracyM = num(raw.max_accuracy_m);
  if (version === null || distanceM === null || maxAgeS === null || maxAccuracyM === null) return null;
  return { version, distanceM, maxAgeS, maxAccuracyM, validFrom: typeof raw.valid_from === 'string' ? raw.valid_from : null };
}

export class ProximityRuleService {
  constructor(private readonly transport: TrackingTransport, private readonly isOnline: () => boolean = () => true) {}

  private async run<T>(fn: 'query-tracking' | 'manage-tracking', body: Raw, pick: (payload: Raw) => T | null): Promise<RuleOutcome<T>> {
    const write = fn === 'manage-tracking';
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call(fn, body);
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = pick(payload);
        return value === null ? { kind: write ? 'unknown' : 'unavailable' } : { kind: 'success', value };
      }
      if (response.status === 401 || payload.code === 'AUTH_REQUIRED') return { kind: 'session_expired' };
      if (payload.code === 'ACCESS_DENIED') return { kind: 'access_denied' };
      if (payload.code === 'JUSTIFICATION_REQUIRED') return { kind: 'invalid', fields: { justification: 'Explique a mudança com 10 a 500 caracteres.' } };
      return { kind: write ? 'unknown' : 'unavailable' };
    } catch {
      return { kind: write ? 'unknown' : 'unavailable' };
    }
  }

  get(organizationId: string): Promise<RuleOutcome<ProximityRuleView>> {
    return this.run('query-tracking', { operation: 'get_proximity_rule', organization_id: organizationId },
      (p) => (p.code === 'FOUND' ? toRule(p.rule) : null));
  }

  async set(organizationId: string, values: { distanceM: number; maxAgeS: number; maxAccuracyM: number }, justification: string,
    requestId: string): Promise<RuleOutcome<ProximityRuleView>> {
    const fields: Record<string, string> = {};
    for (const error of validateRule(values)) fields[error.field] = error.message;
    const text = justification.trim();
    if (text.length < 10 || text.length > 500) fields.justification = 'Explique a mudança com 10 a 500 caracteres.';
    if (Object.keys(fields).length > 0) return { kind: 'invalid', fields };
    return this.run('manage-tracking', {
      operation: 'set_proximity_rule', organization_id: organizationId, request_id: requestId, distance_m: values.distanceM,
      max_age_s: values.maxAgeS, max_accuracy_m: values.maxAccuracyM, justification: text,
    }, (p) => (p.code === 'UPDATED' ? toRule(p.rule) : null));
  }
}
