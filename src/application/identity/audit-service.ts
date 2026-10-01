export interface AuditTransport {
  call(body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type AuditResult = 'success' | 'denied' | 'failed';
export type AuditScope = { scope: 'tenant'; organizationId: string } | { scope: 'global' };

export interface AuditFilters {
  from?: string | undefined;
  to?: string | undefined;
  action?: string | undefined;
  result?: AuditResult | undefined;
  actorId?: string | undefined;
  targetType?: string | undefined;
}

export interface AuditCursor { occurredAt: string; id: number }

export interface AuditEventView {
  id: number;
  organizationId: string | null;
  actor: { id: string | null; displayName: string | null };
  action: string;
  targetType: string;
  targetId: string | null;
  result: AuditResult;
  reasonCode: string | null;
  justification: string | null;
  origin: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface AuditPage { events: AuditEventView[]; next: AuditCursor | null }

export type AuditFailure = 'access_denied' | 'mfa_required' | 'invalid' | 'unavailable';
export type AuditOutcome = { kind: 'success'; value: AuditPage } | { kind: AuditFailure };

const FAILURES: Record<string, AuditFailure> = {
  ACCESS_DENIED: 'access_denied', AUTH_REQUIRED: 'access_denied', MFA_REQUIRED: 'mfa_required', VALIDATION_FAILED: 'invalid',
};
const RESULTS: readonly string[] = ['success', 'denied', 'failed'];

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const blank = (value: string | undefined): boolean => value === undefined || value.trim() === '';

function toEvent(value: unknown): AuditEventView | null {
  if (!isObject(value) || typeof value.id !== 'number' || !RESULTS.includes(String(value.result))) return null;
  if (typeof value.action !== 'string' || typeof value.target_type !== 'string' || typeof value.origin !== 'string' || typeof value.occurred_at !== 'string') return null;
  const actor = isObject(value.actor) ? value.actor : {};
  return {
    id: value.id,
    organizationId: text(value.organization_id),
    actor: { id: text(actor.id), displayName: text(actor.display_name) },
    action: value.action,
    targetType: value.target_type,
    targetId: text(value.target_id),
    result: value.result as AuditResult,
    reasonCode: text(value.reason_code),
    justification: text(value.justification),
    origin: value.origin,
    occurredAt: value.occurred_at,
    metadata: isObject(value.metadata) ? value.metadata : {},
  };
}

function toCursor(value: unknown): AuditCursor | null {
  return isObject(value) && typeof value.occurred_at === 'string' && typeof value.id === 'number'
    ? { occurredAt: value.occurred_at, id: value.id } : null;
}

// Consulta de auditoria somente leitura pela fronteira servidor, que decide o escopo a cada chamada (AUD-004, AUD-007).
export class AuditService {
  constructor(private readonly transport: AuditTransport) {}

  async query(scope: AuditScope, filters: AuditFilters = {}, cursor?: AuditCursor, limit?: number): Promise<AuditOutcome> {
    const from = blank(filters.from) ? undefined : filters.from!.trim();
    const to = blank(filters.to) ? undefined : filters.to!.trim();
    const action = blank(filters.action) ? undefined : filters.action!.trim();
    const targetType = blank(filters.targetType) ? undefined : filters.targetType!.trim();

    if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) return { kind: 'invalid' };
    if (from && to && Date.parse(from) > Date.parse(to)) return { kind: 'invalid' };
    if ((action && !/^[a-z0-9_.]{1,64}$/.test(action)) || (targetType && !/^[a-z0-9_]{1,40}$/.test(targetType))) return { kind: 'invalid' };
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return { kind: 'invalid' };

    const body: Record<string, unknown> = {
      scope: scope.scope,
      ...(scope.scope === 'tenant' ? { organization_id: scope.organizationId } : {}),
      ...(from ? { from } : {}), ...(to ? { to } : {}), ...(action ? { action } : {}),
      ...(filters.result ? { result: filters.result } : {}),
      ...(filters.actorId ? { actor_id: filters.actorId } : {}),
      ...(targetType ? { target_type: targetType } : {}),
      ...(cursor ? { before: { occurred_at: cursor.occurredAt, id: cursor.id } } : {}),
      ...(limit !== undefined ? { limit } : {}),
    };

    try {
      const response = await this.transport.call(body);
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300 && Array.isArray(payload.events)) {
        const events = payload.events.map(toEvent).filter((event): event is AuditEventView => event !== null);
        return { kind: 'success', value: { events, next: toCursor(payload.next) } };
      }
      const code = payload.code;
      return { kind: (typeof code === 'string' ? FAILURES[code] : undefined) ?? 'unavailable' };
    } catch {
      return { kind: 'unavailable' };
    }
  }
}
