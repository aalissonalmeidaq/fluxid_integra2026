import { json, preflight, UUID_PATTERN, type TokenClaims } from '../_shared/http.ts';
import { addressCacheKey } from './address-cache.ts';
import { type GeocodingConfig, providerWindowSeconds } from './config.ts';
import { GeocodingBlockedError, GeocodingProviderError, type GeocodeLocation, type GeocodeQuery, type GeocodingProvider, UFS } from './provider.ts';

export type { GeocodeLocation, GeocodeQuery, GeocodingProvider } from './provider.ts';
export type { TokenClaims };

// Geocodificação do endereço da unidade pelo servidor (RF-065 a RF-068). Integração TEMPORÁRIA e exclusiva do protótipo
// (docs/geocodificacao-prototipo.md). Só logradouro, número, cidade, estado, CEP e país vão ao provedor; a falha do provedor
// nunca bloqueia o cadastro (RF-067); nada é gravado no cadastro aqui (a pessoa confirma antes, RF-066) e o registro de operação
// guarda só identificador, provedor, duração, status e código de erro sanitizado (RF-068): nunca o endereço nem a URL.

// Pessoa e organização como na busca de CEP. O balde global ao provedor respeita a política do Nominatim e o teto configurado
// (no máximo 1 requisição por segundo); a janela vem de GEOCODING_RATE_LIMIT_PER_SECOND.
export const LIMITS = {
  user: { bucket: 'geocode:user', limit: 10, windowSeconds: 60 },
  organization: { bucket: 'geocode:org', limit: 100, windowSeconds: 60 },
  provider: { bucket: 'geocode:provider', limit: 1 },
} as const;

export const PROVIDER_TIMEOUT_MS = 4000;

export type Identity = { userId: string; sessionId: string };
export type Permission = 'OK' | 'AUTH_REQUIRED' | 'ACCESS_DENIED';
export type PersonType = 'individual' | 'legal';
// Cliente da organização, lido do banco: tipo de pessoa e se o registro admite a operação (ativo e não anonimizado).
export interface GeocodeCustomer { personType: PersonType; operable: boolean }

export interface GeocodeGateway {
  authenticate(token: string): Promise<Identity | null>;
  // Confere vínculo, papel e permissão `customer.write` no banco, como as RPCs de escrita.
  checkPermission(actorId: string, sessionId: string, organizationId: string): Promise<Permission>;
  takeToken(bucket: string, subject: string, limit: number, windowSeconds: number): Promise<boolean>;
  // Cliente da organização; `null` quando não existe nela. Tudo vem do banco, nunca do corpo da requisição.
  findCustomer(organizationId: string, customerId: string): Promise<GeocodeCustomer | null>;
  // Cache por organização e chave do endereço normalizado; a leitura devolve só entrada ainda dentro do prazo.
  readCache(organizationId: string, key: string): Promise<GeocodeLocation | null>;
  writeCache(organizationId: string, key: string, location: GeocodeLocation, ttlDays: number): Promise<void>;
}

// Registro de operação (RF-068). Nada além destes campos: nem endereço, nem URL, nem pessoa, nem organização.
export interface GeocodeLogEvent {
  operationId: string;
  provider: string;
  durationMs: number;
  status: number;
  errorCode: string | null;
}

export interface GeocodeDependencies {
  gateway: GeocodeGateway;
  // `null` quando GEOCODING_PROVIDER não nomeia um provedor registrado.
  provider: GeocodingProvider | null;
  config: GeocodingConfig;
  log?: (event: GeocodeLogEvent) => void;
  now?: () => number;
  newOperationId?: () => string;
}

const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

const textField = (input: Record<string, unknown>, name: string, max: number): string | null => {
  const raw = input[name];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value === '' || value.length > max ? null : value;
};

// Só estes campos são lidos do corpo; qualquer outro é ignorado e nunca chega ao provedor. Endereço incompleto (falta
// logradouro, número, cidade, UF ou CEP válido) é recusado antes de qualquer chamada externa.
function parseAddress(input: Record<string, unknown>): { query: GeocodeQuery } | { field: string } {
  const street = textField(input, 'street', 120);
  if (street === null) return { field: 'street' };
  const number = textField(input, 'number', 20);
  if (number === null) return { field: 'number' };
  const city = textField(input, 'city', 80);
  if (city === null) return { field: 'city' };
  const state = typeof input.state === 'string' ? input.state : '';
  if (!(UFS as readonly string[]).includes(state)) return { field: 'state' };
  const postalCode = typeof input.postal_code === 'string' ? input.postal_code.replace(/[\s-]/g, '') : '';
  if (!/^\d{8}$/.test(postalCode)) return { field: 'postal_code' };
  return { query: { street, number, city, state, postal_code: postalCode } };
}

export function createGeocodeAddressHandler({
  gateway, provider, config, log, now = () => Date.now(), newOperationId = () => crypto.randomUUID(),
}: GeocodeDependencies) {
  return async (request: Request): Promise<Response> => {
    const started = now();
    const operationId = newOperationId();
    // `code` é sempre um código fixo do contrato (ou do provedor, já sanitizado), nunca texto vindo da requisição.
    const finish = (code: string, status: number, body: Record<string, unknown> = {}, errorCode: string | null = null): Response => {
      log?.({ operationId, provider: provider?.name ?? config.provider, durationMs: now() - started, status, errorCode });
      return json({ code, ...body }, status);
    };
    const reject = (code: string, status: number, body: Record<string, unknown> = {}): Response => finish(code, status, body, code);

    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return reject('METHOD_NOT_ALLOWED', 405);
    const token = bearer(request);
    if (!token) return reject('AUTH_REQUIRED', 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return reject('AUTH_REQUIRED', 401);

    // Funcionalidade desligada: nada além da autenticação é consultado.
    if (!config.enabled) return reject('FEATURE_DISABLED', 403);

    const body = await request.json().catch(() => null) as unknown;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return reject('VALIDATION_FAILED', 400);
    const input = body as Record<string, unknown>;
    const organizationId = input.organization_id;
    const customerId = input.customer_id;
    if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) return reject('VALIDATION_FAILED', 400);
    if (typeof customerId !== 'string' || !UUID_PATTERN.test(customerId)) return reject('VALIDATION_FAILED', 400);

    // Confirmação explícita de que o endereço será enviado ao serviço externo (só `true` vale).
    if (config.requireConfirmation && input.consent_confirmed !== true) return reject('CONFIRMATION_REQUIRED', 428);

    const parsed = parseAddress(input);
    if ('field' in parsed) return reject('ADDRESS_INCOMPLETE', 400, { fields: [{ field: parsed.field, message: 'Confira este campo do endereço.' }] });

    const permission = await gateway.checkPermission(identity.userId, identity.sessionId, organizationId).catch(() => null);
    if (permission === null) return reject('INTERNAL_ERROR', 500);
    if (permission !== 'OK') return reject(permission, permission === 'AUTH_REQUIRED' ? 401 : 403);

    // Cadastro de pessoa física: o endereço é dado pessoal e não sai do servidor (salvo GEOCODING_ALLOW_PERSONAL_ADDRESSES=true).
    const customer = await gateway.findCustomer(organizationId, customerId).catch(() => 'ERROR' as const);
    if (customer === 'ERROR') return reject('INTERNAL_ERROR', 500);
    if (customer === null) return reject('NOT_FOUND', 404);
    if (customer.personType === 'individual' && !config.allowPersonalAddresses) return reject('PERSONAL_ADDRESS_NOT_ALLOWED', 403);
    if (!customer.operable) return reject('CUSTOMER_NOT_OPERABLE', 409);

    const withinUser = await gateway.takeToken(LIMITS.user.bucket, identity.userId, LIMITS.user.limit, LIMITS.user.windowSeconds).catch(() => null);
    const withinOrganization = await gateway.takeToken(LIMITS.organization.bucket, organizationId, LIMITS.organization.limit, LIMITS.organization.windowSeconds).catch(() => null);
    if (withinUser === null || withinOrganization === null) return reject('INTERNAL_ERROR', 500);
    if (!withinUser || !withinOrganization) return reject('RATE_LIMITED', 429, { retry_after_seconds: LIMITS.user.windowSeconds });

    if (!provider) return reject('SERVICE_UNAVAILABLE', 503);

    // Cache por organização: um acerto não chama o provedor nem gasta o limite global dele. Falha do cache nunca bloqueia:
    // a consulta segue ao provedor.
    const key = await addressCacheKey(parsed.query);
    const cached = await gateway.readCache(organizationId, key).catch(() => null);
    if (cached) return finish('FOUND', 200, { location: cached, cached: true });

    // O balde global só é consumido por quem passou nos limites individuais, para a fila de um não gastar a vez dos outros.
    const windowSeconds = providerWindowSeconds(config.ratePerSecond);
    const withinProvider = await gateway.takeToken(LIMITS.provider.bucket, provider.name, LIMITS.provider.limit, windowSeconds).catch(() => null);
    if (withinProvider === null) return reject('INTERNAL_ERROR', 500);
    if (!withinProvider) return reject('RATE_LIMITED', 429, { retry_after_seconds: windowSeconds });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const found = await provider.geocode(parsed.query, controller.signal);
      if (found === 'NOT_FOUND') return finish('NOT_FOUND', 200);
      await gateway.writeCache(organizationId, key, found, config.cacheTtlDays).catch(() => undefined);
      return finish('FOUND', 200, { location: found, cached: false });
    } catch (error) {
      if (error instanceof GeocodingBlockedError) return finish(error.code, 403, {}, error.code);
      const errorCode = error instanceof GeocodingProviderError ? error.code : controller.signal.aborted ? 'provider_timeout' : 'provider_error';
      return finish('SERVICE_UNAVAILABLE', 503, {}, errorCode);
    } finally {
      clearTimeout(timer);
    }
  };
}
