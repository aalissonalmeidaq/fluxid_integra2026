import { json, preflight, UUID_PATTERN } from '../_shared/http.ts';

type Identity = { userId: string; sessionId: string; aal: 'aal1' | 'aal2' };

export interface AuditQuery {
  actorId: string;
  sessionId: string;
  scope: 'tenant' | 'global';
  organizationId?: string;
  from?: string;
  to?: string;
  action?: string;
  result?: 'success' | 'denied' | 'failed';
  actorFilter?: string;
  targetType?: string;
  beforeAt?: string;
  beforeId?: number;
  limit?: number;
}

export type AuditQueryResult =
  | { kind: 'listed'; events: unknown[]; next: { occurred_at: string; id: number } | null }
  | { kind: 'access_denied' }
  | { kind: 'invalid' };

export interface AuditGateway {
  authenticate(token: string): Promise<Identity | null>;
  query(input: AuditQuery): Promise<AuditQueryResult>;
  audit(event: { actorId: string; action: string; result: 'denied' | 'failed'; reason: string }): Promise<void>;
}

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const isoDate = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const RESULTS = ['success', 'denied', 'failed'] as const;

const invalid = () => json({ code: 'VALIDATION_FAILED' }, 400);

// Valida e normaliza o pedido; devolve nulo para qualquer entrada fora do contrato.
function parseQuery(body: Record<string, unknown>, identity: Identity): AuditQuery | null {
  const scope = body.scope;
  if (scope !== 'tenant' && scope !== 'global') return null;
  const query: AuditQuery = { actorId: identity.userId, sessionId: identity.sessionId, scope };

  if (scope === 'tenant') {
    if (typeof body.organization_id !== 'string' || !UUID_PATTERN.test(body.organization_id)) return null;
    query.organizationId = body.organization_id;
  }
  if (body.from !== undefined) { if (!isoDate(body.from)) return null; query.from = body.from; }
  if (body.to !== undefined) { if (!isoDate(body.to)) return null; query.to = body.to; }
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) return null;
  if (body.action !== undefined) { if (typeof body.action !== 'string' || !/^[a-z0-9_.]{1,64}$/.test(body.action)) return null; query.action = body.action; }
  if (body.result !== undefined) { if (!(RESULTS as readonly unknown[]).includes(body.result)) return null; query.result = body.result as AuditQuery['result']; }
  if (body.actor_id !== undefined) { if (typeof body.actor_id !== 'string' || !UUID_PATTERN.test(body.actor_id)) return null; query.actorFilter = body.actor_id; }
  if (body.target_type !== undefined) { if (typeof body.target_type !== 'string' || !/^[a-z0-9_]{1,40}$/.test(body.target_type)) return null; query.targetType = body.target_type; }
  if (body.before !== undefined) {
    const before = body.before as { occurred_at?: unknown; id?: unknown } | null;
    if (!before || !isoDate(before.occurred_at) || !Number.isSafeInteger(before.id) || Number(before.id) < 1) return null;
    query.beforeAt = before.occurred_at;
    query.beforeId = Number(before.id);
  }
  if (body.limit !== undefined) {
    if (!Number.isInteger(body.limit) || Number(body.limit) < 1 || Number(body.limit) > 100) return null;
    query.limit = Number(body.limit);
  }
  return query;
}

// Consulta de auditoria somente leitura. Tenant: `audit.read` no tenant; global: Master ou Administrador FluxID com MFA.
// A autorização é decidida no banco a cada chamada; negações são auditadas sem tenant solicitado nem alvo (AUD-005, AUD-007).
export function createQueryAuditHandler(gateway: AuditGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const query = body ? parseQuery(body, identity) : null;
    if (!query) return invalid();

    if (query.scope === 'global' && identity.aal !== 'aal2') {
      await gateway.audit({ actorId: identity.userId, action: 'audit.query', result: 'denied', reason: 'mfa_required' });
      return json({ code: 'MFA_REQUIRED' }, 403);
    }

    try {
      const result = await gateway.query(query);
      if (result.kind === 'invalid') return invalid();
      if (result.kind === 'access_denied') {
        await gateway.audit({ actorId: identity.userId, action: 'audit.query', result: 'denied', reason: 'permission_denied' });
        return json({ code: 'ACCESS_DENIED' }, 403);
      }
      return json({ code: 'AUDIT_LISTED', events: result.events, next: result.next });
    } catch {
      await gateway.audit({ actorId: identity.userId, action: 'audit.query', result: 'failed', reason: 'internal_error' }).catch(() => undefined);
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}
