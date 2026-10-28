// Ocorrência de afastamento (Spec 015, T067; US4, RF-022) sobre `query-tracking` e `manage-tracking`. Consulta com as comparações que a
// confirmaram e reconhece/encerra com versão e identificador de pedido: a repetição de um envio usa o mesmo pedido e o servidor não
// duplica. Falhas viram estado de tela, com códigos sanitizados. Fora do React.
import type { TrackingTransport } from './tracking-ports';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : typeof value === 'string' && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

export interface OccurrenceEvidence {
  id: string;
  observedAt: string;
  result: string;
  reason: string;
  distanceM: number | null;
  thresholdM: number | null;
  ruleVersion: number;
  retrospective: boolean;
}

export interface OccurrenceView {
  id: string;
  status: 'open' | 'acknowledged' | 'closed' | 'historical_only';
  detectionKind: 'live' | 'retrospective';
  version: number;
  openedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closeNote: string | null;
  tripId: string;
  tripNumber: number | null;
  cylinderId: string;
  serialNumber: string | null;
  deviceLabel: string | null;
  alertId: string | null;
  evidences: OccurrenceEvidence[];
}

export type OccurrenceFailure = 'offline' | 'unavailable' | 'unknown' | 'session_expired' | 'access_denied' | 'not_found' | 'version_conflict'
  | 'invalid_transition' | 'note_required';
export type OccurrenceOutcome<T> = { kind: 'success'; value: T } | { kind: OccurrenceFailure };

const FAILURES: Record<string, OccurrenceFailure> = {
  AUTH_REQUIRED: 'session_expired', ACCESS_DENIED: 'access_denied', NOT_FOUND: 'not_found', VERSION_CONFLICT: 'version_conflict',
  INVALID_TRANSITION: 'invalid_transition', NOTE_REQUIRED: 'note_required',
};

function toView(p: Raw): OccurrenceView | null {
  const o = p.occurrence;
  if (p.code !== 'FOUND' || !isObject(o) || !Array.isArray(p.evidences)) return null;
  const id = str(o.id);
  const status = str(o.status);
  const version = num(o.version);
  const openedAt = str(o.opened_at);
  const tripId = str(o.trip_id);
  const cylinderId = str(o.cylinder_id);
  if (!id || !status || version === null || !openedAt || !tripId || !cylinderId) return null;
  const evidences: OccurrenceEvidence[] = [];
  for (const e of p.evidences) {
    if (!isObject(e) || !str(e.id) || !str(e.observed_at)) return null;
    evidences.push({ id: e.id as string, observedAt: e.observed_at as string, result: str(e.result) ?? '', reason: str(e.reason) ?? '',
      distanceM: num(e.distance_m), thresholdM: num(e.distance_threshold_m), ruleVersion: num(e.rule_version) ?? 0, retrospective: e.retrospective === true });
  }
  return {
    id, status: status as OccurrenceView['status'], detectionKind: o.detection_kind === 'retrospective' ? 'retrospective' : 'live', version, openedAt,
    acknowledgedAt: str(o.acknowledged_at), acknowledgedBy: str(o.acknowledged_by_name), closedAt: str(o.closed_at), closedBy: str(o.closed_by_name),
    closeNote: str(o.close_note), tripId, tripNumber: num(o.trip_number), cylinderId, serialNumber: str(o.serial_number), deviceLabel: str(o.device_label),
    alertId: str(o.alert_id), evidences,
  };
}

export class ProximityOccurrenceService {
  constructor(private readonly transport: TrackingTransport, private readonly isOnline: () => boolean = () => true) {}

  private async run<T>(fn: 'query-tracking' | 'manage-tracking', body: Raw, pick: (payload: Raw) => T | null): Promise<OccurrenceOutcome<T>> {
    const write = fn === 'manage-tracking';
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call(fn, body);
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = pick(payload);
        return value === null ? { kind: write ? 'unknown' : 'unavailable' } : { kind: 'success', value };
      }
      if (response.status === 401) return { kind: 'session_expired' };
      const kind = typeof payload.code === 'string' ? FAILURES[payload.code] : undefined;
      return { kind: kind && response.status < 500 ? kind : write ? 'unknown' : 'unavailable' };
    } catch {
      return { kind: write ? 'unknown' : 'unavailable' };
    }
  }

  get(organizationId: string, occurrenceId: string): Promise<OccurrenceOutcome<OccurrenceView>> {
    return this.run('query-tracking', { operation: 'get_proximity_occurrence', organization_id: organizationId, occurrence_id: occurrenceId }, toView);
  }

  acknowledge(organizationId: string, occurrenceId: string, version: number, requestId: string): Promise<OccurrenceOutcome<{ version: number }>> {
    return this.run('manage-tracking', { operation: 'acknowledge_proximity_occurrence', organization_id: organizationId, request_id: requestId,
      occurrence_id: occurrenceId, version }, (p) => (p.code === 'ACKNOWLEDGED' && num(p.version) !== null ? { version: num(p.version)! } : null));
  }

  async close(organizationId: string, occurrenceId: string, version: number, note: string, requestId: string): Promise<OccurrenceOutcome<{ version: number }>> {
    const text = note.replace(/\s+/g, ' ').trim();
    if (text.length < 5 || text.length > 500) return { kind: 'note_required' };
    return this.run('manage-tracking', { operation: 'close_proximity_occurrence', organization_id: organizationId, request_id: requestId,
      occurrence_id: occurrenceId, version, note: text }, (p) => (p.code === 'CLOSED' && num(p.version) !== null ? { version: num(p.version)! } : null));
  }
}
