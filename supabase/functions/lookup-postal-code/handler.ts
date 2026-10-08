import { json, preflight, UUID_PATTERN, type TokenClaims } from '../_shared/http.ts';
import type { PostalCodeProvider } from './provider.ts';

export type { PostalAddress, PostalCodeProvider, PostalLookup } from './provider.ts';
export type { TokenClaims };

// Busca de CEP pelo servidor (contracts/consulta-de-cep.md). Só o CEP vai ao provedor (RF-009); a falha do provedor nunca
// bloqueia o cadastro (RF-011); nada é gravado, auditado nem registrado em log junto de dados da pessoa (RF-012).

// Limite de taxa: 10 buscas por minuto por pessoa e 100 por minuto por organização (esclarecimento de 07/10/2026).
export const LIMITS = {
  user: { bucket: 'postal_code:user', limit: 10, windowSeconds: 60 },
  organization: { bucket: 'postal_code:org', limit: 100, windowSeconds: 60 },
} as const;

// Tempo máximo da chamada ao provedor, dentro dos 5 s da spec (RNF-004).
export const PROVIDER_TIMEOUT_MS = 4000;

export type Identity = { userId: string; sessionId: string };
export type Permission = 'OK' | 'AUTH_REQUIRED' | 'ACCESS_DENIED';

export interface LookupGateway {
  authenticate(token: string): Promise<Identity | null>;
  // Confere vínculo, papel e permissão `customer.write` no banco, como as RPCs de escrita.
  checkPermission(actorId: string, sessionId: string, organizationId: string): Promise<Permission>;
  // Consome um uso do balde e devolve se ainda está dentro do limite (conta toda tentativa, inclusive as negadas).
  takeToken(bucket: string, subject: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface LookupDependencies {
  gateway: LookupGateway;
  provider: PostalCodeProvider;
  // Só código de resultado e duração, nunca o CEP nem identificação da pessoa.
  log?: (event: { code: string; durationMs: number }) => void;
  now?: () => number;
}

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

export function createLookupPostalCodeHandler({ gateway, provider, log, now = () => Date.now() }: LookupDependencies) {
  return async (request: Request): Promise<Response> => {
    const started = now();
    const finish = (code: string, status: number, body: Record<string, unknown> = {}): Response => {
      log?.({ code, durationMs: now() - started });
      return json({ code, ...body }, status);
    };

    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return finish('METHOD_NOT_ALLOWED', 405);
    const token = bearer(request);
    if (!token) return finish('AUTH_REQUIRED', 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return finish('AUTH_REQUIRED', 401);

    const body = await request.json().catch(() => null) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return finish('VALIDATION_FAILED', 400);
    const input = body as Record<string, unknown>;
    const organizationId = input.organization_id;
    if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) return finish('VALIDATION_FAILED', 400);
    // Só o CEP importa: qualquer outro campo do corpo é ignorado e nunca chega ao provedor.
    const postalCode = typeof input.postal_code === 'string' ? input.postal_code.replace(/[\s-]/g, '') : '';
    if (!/^\d{8}$/.test(postalCode)) {
      return finish('VALIDATION_FAILED', 400, { fields: [{ field: 'postal_code', message: 'Informe o CEP com 8 dígitos.' }] });
    }

    const permission = await gateway.checkPermission(identity.userId, identity.sessionId, organizationId).catch(() => null);
    if (permission === null) return finish('INTERNAL_ERROR', 500);
    if (permission !== 'OK') return finish(permission, permission === 'AUTH_REQUIRED' ? 401 : 403);

    const withinUser = await gateway.takeToken(LIMITS.user.bucket, identity.userId, LIMITS.user.limit, LIMITS.user.windowSeconds).catch(() => null);
    const withinOrganization = await gateway.takeToken(LIMITS.organization.bucket, organizationId, LIMITS.organization.limit, LIMITS.organization.windowSeconds).catch(() => null);
    if (withinUser === null || withinOrganization === null) return finish('INTERNAL_ERROR', 500);
    if (!withinUser || !withinOrganization) {
      return finish('RATE_LIMITED', 429, { retry_after_seconds: LIMITS.user.windowSeconds });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const found = await provider.lookup(postalCode, controller.signal);
      if (found === 'NOT_FOUND') return finish('NOT_FOUND', 200);
      return finish('FOUND', 200, { address: found });
    } catch {
      // Tempo esgotado, erro do provedor, JSON inválido ou resposta suspeita: a tela segue pela digitação do endereço.
      return finish('SERVICE_UNAVAILABLE', 503);
    } finally {
      clearTimeout(timer);
    }
  };
}
