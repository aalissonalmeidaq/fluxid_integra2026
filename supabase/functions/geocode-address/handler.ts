import { json, preflight, UUID_PATTERN, type TokenClaims } from '../_shared/http.ts';
import { type GeocodeQuery, type GeocodingProvider, UFS } from './provider.ts';

export type { GeocodeLocation, GeocodeQuery, GeocodingProvider } from './provider.ts';
export type { TokenClaims };

// Geocodificação do endereço da unidade pelo servidor (RF-065 a RF-068). Só campos de endereço vão ao provedor; a falha do
// provedor nunca bloqueia o cadastro (RF-067); nada é gravado aqui (a pessoa confirma antes, RF-066) e o log guarda só o
// código do resultado e a duração (RF-068).

// Pessoa e organização como na busca de CEP; o balde global respeita a política do Nominatim (1 requisição por segundo).
export const LIMITS = {
  user: { bucket: 'geocode:user', limit: 10, windowSeconds: 60 },
  organization: { bucket: 'geocode:org', limit: 100, windowSeconds: 60 },
  provider: { bucket: 'geocode:provider', subject: 'nominatim', limit: 1, windowSeconds: 1 },
} as const;

export const PROVIDER_TIMEOUT_MS = 4000;

export type Identity = { userId: string; sessionId: string };
export type Permission = 'OK' | 'AUTH_REQUIRED' | 'ACCESS_DENIED';

export interface GeocodeGateway {
  authenticate(token: string): Promise<Identity | null>;
  // Confere vínculo, papel e permissão `customer.write` no banco, como as RPCs de escrita.
  checkPermission(actorId: string, sessionId: string, organizationId: string): Promise<Permission>;
  takeToken(bucket: string, subject: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export interface GeocodeDependencies {
  gateway: GeocodeGateway;
  provider: GeocodingProvider;
  log?: (event: { code: string; durationMs: number }) => void;
  now?: () => number;
}

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

const textField = (input: Record<string, unknown>, name: string, max: number, required: boolean): string | null => {
  const raw = input[name];
  if (raw === undefined || raw === null) return required ? null : '';
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length > max || (required && value === '')) return null;
  return value;
};

// Só estes campos são lidos do corpo; qualquer outro é ignorado e nunca chega ao provedor.
function parseAddress(input: Record<string, unknown>): { query: GeocodeQuery } | { field: string } {
  const street = textField(input, 'street', 120, true);
  if (street === null) return { field: 'street' };
  const number = textField(input, 'number', 20, false);
  if (number === null) return { field: 'number' };
  const district = textField(input, 'district', 80, false);
  if (district === null) return { field: 'district' };
  const city = textField(input, 'city', 80, true);
  if (city === null) return { field: 'city' };
  const state = typeof input.state === 'string' ? input.state : '';
  if (!(UFS as readonly string[]).includes(state)) return { field: 'state' };
  const postalRaw = textField(input, 'postal_code', 12, false);
  const postalCode = postalRaw === null ? null : postalRaw.replace(/[\s-]/g, '');
  if (postalCode === null || (postalCode !== '' && !/^\d{8}$/.test(postalCode))) return { field: 'postal_code' };
  return { query: { street, number, district, city, state, postal_code: postalCode } };
}

export function createGeocodeAddressHandler({ gateway, provider, log, now = () => Date.now() }: GeocodeDependencies) {
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
    const parsed = parseAddress(input);
    if ('field' in parsed) {
      return finish('VALIDATION_FAILED', 400, { fields: [{ field: parsed.field, message: 'Confira este campo do endereço.' }] });
    }

    const permission = await gateway.checkPermission(identity.userId, identity.sessionId, organizationId).catch(() => null);
    if (permission === null) return finish('INTERNAL_ERROR', 500);
    if (permission !== 'OK') return finish(permission, permission === 'AUTH_REQUIRED' ? 401 : 403);

    const withinUser = await gateway.takeToken(LIMITS.user.bucket, identity.userId, LIMITS.user.limit, LIMITS.user.windowSeconds).catch(() => null);
    const withinOrganization = await gateway.takeToken(LIMITS.organization.bucket, organizationId, LIMITS.organization.limit, LIMITS.organization.windowSeconds).catch(() => null);
    if (withinUser === null || withinOrganization === null) return finish('INTERNAL_ERROR', 500);
    if (!withinUser || !withinOrganization) return finish('RATE_LIMITED', 429, { retry_after_seconds: LIMITS.user.windowSeconds });
    // O balde global só é consumido por quem passou nos limites individuais, para a fila de um não gastar a vez dos outros.
    const withinProvider = await gateway.takeToken(LIMITS.provider.bucket, LIMITS.provider.subject, LIMITS.provider.limit, LIMITS.provider.windowSeconds).catch(() => null);
    if (withinProvider === null) return finish('INTERNAL_ERROR', 500);
    if (!withinProvider) return finish('RATE_LIMITED', 429, { retry_after_seconds: LIMITS.provider.windowSeconds });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const found = await provider.geocode(parsed.query, controller.signal);
      if (found === 'NOT_FOUND') return finish('NOT_FOUND', 200);
      return finish('FOUND', 200, { location: found });
    } catch {
      return finish('SERVICE_UNAVAILABLE', 503);
    } finally {
      clearTimeout(timer);
    }
  };
}
