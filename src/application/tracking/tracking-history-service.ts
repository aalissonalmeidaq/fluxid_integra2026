// Histórico do rastreamento (Spec 015, T060; US3) sobre `query-tracking`: uma página por vez, com cursor estável. Cada fato vira um item
// tipado; a cronologia com lacunas é montada pelo agregador do domínio (src/domain/tracking/tracking-timeline.ts), nunca na tela.
import type { RuleLimits } from '@/domain/tracking/freshness';
import type { HistoryQuery } from '@/domain/tracking/history-query';
import type { ComparisonResult } from '@/domain/tracking/tracking-types';
import type { TrackedPositionView } from './tracking-views';
import { toPosition, toRule, TripTrackingService, type TrackingOutcome } from './trip-tracking-service';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : typeof value === 'string' && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

interface Base { id: string; occurredAt: string; subjectId: string }
export type HistoryItem =
  | (Base & { kind: 'position'; label: string; position: TrackedPositionView })
  | (Base & { kind: 'comparison'; cylinderId: string; result: ComparisonResult; reason: string; distanceM: number | null; retrospective: boolean; ruleVersion: number })
  | (Base & { kind: 'occurrence'; cylinderId: string; status: string; detectionKind: string; alertId: string | null })
  | (Base & { kind: 'alert'; cylinderId: string | null; alertKind: string; severity: string; status: string })
  | (Base & { kind: 'event'; eventType: string })
  | (Base & { kind: 'presence'; cylinderId: string; source: string });

export interface HistoryPage {
  generatedAt: string;
  rule: RuleLimits;
  items: HistoryItem[];
  nextCursor: { at: string; id: string } | null;
}

const KNOWN = ['position', 'comparison', 'occurrence', 'alert', 'event', 'presence'];

// `undefined`: tipo que esta versão não conhece (ignorado); `null`: item malformado.
function toItem(raw: unknown, rule: RuleLimits, now: Date): HistoryItem | null | undefined {
  if (!isObject(raw)) return null;
  const kind = str(raw.kind);
  if (kind && !KNOWN.includes(kind)) return undefined;
  const id = str(raw.id);
  const occurredAt = str(raw.occurred_at);
  const subjectId = str(raw.subject_id);
  if (!kind || !id || !occurredAt || !subjectId) return null;
  const base = { id, occurredAt, subjectId };
  switch (kind) {
    case 'position': {
      const origin = raw.origin === 'seal' ? 'seal' : raw.origin === 'mobile' ? 'mobile' : null;
      const position = origin ? toPosition(raw, origin, subjectId, rule, now) : null;
      return position ? { ...base, kind, label: str(raw.subject_label) ?? '', position } : null;
    }
    case 'comparison': {
      const result = str(raw.result);
      const cylinderId = str(raw.cylinder_id);
      if (!result || !cylinderId) return null;
      return { ...base, kind, cylinderId, result: result as ComparisonResult, reason: str(raw.reason) ?? '', distanceM: num(raw.distance_m),
        retrospective: raw.retrospective === true, ruleVersion: num(raw.rule_version) ?? 0 };
    }
    case 'occurrence': {
      const cylinderId = str(raw.cylinder_id);
      const status = str(raw.status);
      return cylinderId && status ? { ...base, kind, cylinderId, status, detectionKind: str(raw.detection_kind) ?? 'live', alertId: str(raw.alert_id) } : null;
    }
    case 'alert': {
      const alertKind = str(raw.alert_kind);
      return alertKind ? { ...base, kind, cylinderId: str(raw.cylinder_id), alertKind, severity: str(raw.severity) ?? '', status: str(raw.status) ?? '' } : null;
    }
    case 'event': {
      const eventType = str(raw.event_type);
      return eventType ? { ...base, kind, eventType } : null;
    }
    default: {
      const cylinderId = str(raw.cylinder_id);
      const source = str(raw.source);
      return cylinderId && source ? { ...base, kind: 'presence', cylinderId, source } : null;
    }
  }
}

export class TrackingHistoryService extends TripTrackingService {
  page(organizationId: string, query: HistoryQuery, cursor: { at: string; id: string } | null): Promise<TrackingOutcome<HistoryPage>> {
    return this.run({
      operation: 'query_tracking_history', organization_id: organizationId, subject: query.subject, subject_id: query.subjectId,
      from: query.from, to: query.to, ...(cursor ? { cursor_at: cursor.at, cursor_id: cursor.id } : {}), limit: 200,
    }, (p) => {
      const rule = toRule(p.rule);
      const generatedAt = str(p.generated_at);
      if (p.code !== 'LISTED' || !rule || !generatedAt || !Array.isArray(p.items)) return null;
      const now = this.now();
      const items: HistoryItem[] = [];
      for (const raw of p.items) {
        const item = toItem(raw, rule, now);
        if (item === null) return null;
        if (item) items.push(item);
      }
      const next = isObject(p.next_cursor) && str(p.next_cursor.at) && str(p.next_cursor.id)
        ? { at: p.next_cursor.at as string, id: p.next_cursor.id as string } : null;
      return { generatedAt, rule, items, nextCursor: next };
    });
  }
}
