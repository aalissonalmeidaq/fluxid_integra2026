import { json, preflight, UUID_PATTERN } from '../_shared/http.ts';

type Identity = { userId: string; sessionId: string };

export interface PermissionsQuery { actorId: string; sessionId: string; organizationId?: string }

export type PermissionsResult =
  | { kind: 'listed'; tenant: string[]; global: string[] }
  | { kind: 'access_denied' };

export interface PermissionsGateway {
  authenticate(token: string): Promise<Identity | null>;
  query(input: PermissionsQuery): Promise<PermissionsResult>;
}

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

// Consulta das próprias permissões, somente leitura e sem auditoria (RF-023). A sessão, o vínculo, o papel e a permissão
// são avaliados no banco a cada chamada; o tenant do pedido é só contexto e nunca prova de acesso. Nada vai para o log.
export function createQueryPermissionsHandler(gateway: PermissionsGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const organizationId = body?.organization_id;
    if (organizationId !== undefined && (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId))) {
      return json({ code: 'VALIDATION_FAILED' }, 400);
    }
    const query: PermissionsQuery = { actorId: identity.userId, sessionId: identity.sessionId };
    if (organizationId !== undefined) query.organizationId = organizationId as string;

    try {
      const result = await gateway.query(query);
      if (result.kind === 'access_denied') return json({ code: 'AUTH_REQUIRED' }, 401);
      return json({ code: 'PERMISSIONS_LISTED', tenant: result.tenant, global: result.global });
    } catch {
      return json({ code: 'INTERNAL_ERROR' }, 500);
    }
  };
}
