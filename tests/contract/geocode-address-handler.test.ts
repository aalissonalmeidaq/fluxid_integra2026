// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createGeocodeAddressHandler, LIMITS, PROVIDER_TIMEOUT_MS, type GeocodeGateway, type GeocodingProvider,
} from '../../supabase/functions/geocode-address/handler';

// Spec 007, US1: função geocode-address (RF-065 a RF-068). O provedor é sempre falso: o CI nunca chama o Nominatim real.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const ADDRESS = { street: 'Praça da Sé', number: '100', district: 'Sé', city: 'São Paulo', state: 'SP', postal_code: '01001000' };
const LOCATION = { latitude: -23.550453, longitude: -46.633911, display_name: 'Praça da Sé, São Paulo', precision: 'address' as const };

type Gateway = GeocodeGateway & { authenticate: ReturnType<typeof vi.fn>; checkPermission: ReturnType<typeof vi.fn>; takeToken: ReturnType<typeof vi.fn> };
const gateway = (overrides: Partial<GeocodeGateway> = {}): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION })),
  checkPermission: vi.fn(async () => 'OK' as const),
  takeToken: vi.fn(async () => true),
  ...overrides,
}) as never;

type Provider = GeocodingProvider & { geocode: ReturnType<typeof vi.fn> };
const provider = (impl: GeocodingProvider['geocode'] = async () => LOCATION): Provider => ({ geocode: vi.fn(impl) }) as never;

const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
const run = (gw: Gateway, prov: Provider, request: Request, log = vi.fn()) => createGeocodeAddressHandler({ gateway: gw, provider: prov, log })(request);
const body = (response: Response) => response.json() as Promise<Record<string, unknown>>;
const valid = { organization_id: ORG, ...ADDRESS };

describe('geocode-address: sucesso e endereço inexistente', () => {
  it('devolve a localização e normaliza o CEP antes de chamar o provedor', async () => {
    const prov = provider();
    const response = await run(gateway(), prov, post({ ...valid, postal_code: '01001-000' }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ code: 'FOUND', location: LOCATION });
    expect(prov.geocode.mock.calls[0]?.[0]).toEqual(ADDRESS);
  });

  it('endereço que o provedor não acha é NOT_FOUND com HTTP 200', async () => {
    const response = await run(gateway(), provider(async () => 'NOT_FOUND'), post(valid));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ code: 'NOT_FOUND' });
  });

  it('só campos de endereço chegam ao provedor: nome, documento, contatos e instruções são ignorados', async () => {
    const prov = provider();
    await run(gateway(), prov, post({ ...valid, name: 'Hospital Alfa', document: '11222333000181', receiving_contact_name: 'Maria', access_instructions: 'portão 2', latitude: 1, longitude: 2 }));
    expect(Object.keys(prov.geocode.mock.calls[0]?.[0] as object).sort()).toEqual(['city', 'district', 'number', 'postal_code', 'state', 'street']);
    expect(prov.geocode.mock.calls[0]).toHaveLength(2);
  });

  it('bairro e CEP são opcionais', async () => {
    const prov = provider();
    const response = await run(gateway(), prov, post({ organization_id: ORG, street: 'Rua A', number: 'S/N', city: 'Recife', state: 'PE' }));
    expect(response.status).toBe(200);
    expect(prov.geocode.mock.calls[0]?.[0]).toEqual({ street: 'Rua A', number: 'S/N', district: '', city: 'Recife', state: 'PE', postal_code: '' });
  });
});

describe('geocode-address: validação e autorização antes de qualquer chamada externa', () => {
  it.each([
    ['sem logradouro', { street: '' }], ['sem cidade', { city: '' }], ['UF inválida', { state: 'XX' }], ['UF minúscula', { state: 'sp' }],
    ['CEP malformado', { postal_code: '0100' }], ['logradouro longo demais', { street: 'a'.repeat(121) }], ['número que não é texto', { number: 10 }],
  ])('%s: 400 sem chamar o provedor nem consumir limite', async (_name, patch) => {
    const prov = provider();
    const gw = gateway();
    const response = await run(gw, prov, post({ ...valid, ...patch }));
    expect(response.status).toBe(400);
    expect((await body(response)).code).toBe('VALIDATION_FAILED');
    expect(prov.geocode).not.toHaveBeenCalled();
    expect(gw.takeToken).not.toHaveBeenCalled();
  });

  it('só aceita POST e responde ao preflight', async () => {
    expect((await run(gateway(), provider(), post({}, 'jwt', 'GET'))).status).toBe(405);
    expect((await run(gateway(), provider(), new Request('http://local/fn', { method: 'OPTIONS' }))).status).toBe(204);
  });

  it('sem token ou token inválido: 401, sem consultar permissão nem provedor', async () => {
    const prov = provider();
    const gw = gateway();
    expect((await run(gw, prov, post(valid, ''))).status).toBe(401);
    expect((await run(gateway({ authenticate: vi.fn(async () => null) }), prov, post(valid))).status).toBe(401);
    expect(gw.checkPermission).not.toHaveBeenCalled();
    expect(prov.geocode).not.toHaveBeenCalled();
  });

  it('organização que não é UUID ou corpo que não é objeto: 400', async () => {
    const prov = provider();
    expect((await run(gateway(), prov, post({ ...valid, organization_id: 'abc' }))).status).toBe(400);
    expect((await run(gateway(), prov, post([1]))).status).toBe(400);
    expect(prov.geocode).not.toHaveBeenCalled();
  });

  it('sem a permissão: 403, sem consumir limite nem chamar o provedor', async () => {
    const prov = provider();
    const gw = gateway({ checkPermission: vi.fn(async () => 'ACCESS_DENIED' as const) });
    expect((await run(gw, prov, post(valid))).status).toBe(403);
    expect(gw.takeToken).not.toHaveBeenCalled();
    expect(prov.geocode).not.toHaveBeenCalled();
  });

  it('sessão vencida: 401; falha na conferência é erro interno, nunca liberação', async () => {
    expect((await run(gateway({ checkPermission: vi.fn(async () => 'AUTH_REQUIRED' as const) }), provider(), post(valid))).status).toBe(401);
    const prov = provider();
    expect((await run(gateway({ checkPermission: vi.fn(async () => { throw new Error('x'); }) }), prov, post(valid))).status).toBe(500);
    expect(prov.geocode).not.toHaveBeenCalled();
  });
});

describe('geocode-address: limite de taxa e política do Nominatim', () => {
  it('usa os baldes por pessoa, por organização e o global de 1 por segundo', async () => {
    const gw = gateway();
    await run(gw, provider(), post(valid));
    expect(gw.takeToken).toHaveBeenCalledWith('geocode:user', USER, 10, 60);
    expect(gw.takeToken).toHaveBeenCalledWith('geocode:org', ORG, 100, 60);
    expect(gw.takeToken).toHaveBeenCalledWith('geocode:provider', 'nominatim', 1, 1);
    expect(LIMITS.provider.limit).toBe(1);
  });

  it.each([['geocode:user', 60], ['geocode:org', 60], ['geocode:provider', 1]])('estourou o balde %s: 429 com o tempo de espera, sem chamar o provedor', async (bucket, wait) => {
    const prov = provider();
    const response = await run(gateway({ takeToken: vi.fn(async (b: string) => b !== bucket) }), prov, post(valid));
    expect(response.status).toBe(429);
    expect(await body(response)).toEqual({ code: 'RATE_LIMITED', retry_after_seconds: wait });
    expect(prov.geocode).not.toHaveBeenCalled();
  });

  it('falha do banco ao contar o limite é erro interno', async () => {
    expect((await run(gateway({ takeToken: vi.fn(async () => { throw new Error('x'); }) }), provider(), post(valid))).status).toBe(500);
  });
});

describe('geocode-address: falhas do provedor nunca bloqueiam o cadastro', () => {
  it('erro do provedor: 503 SERVICE_UNAVAILABLE', async () => {
    const response = await run(gateway(), provider(async () => { throw new Error('provider_status'); }), post(valid));
    expect(response.status).toBe(503);
    expect((await body(response)).code).toBe('SERVICE_UNAVAILABLE');
  });

  it('tempo esgotado: aborta o sinal em 4 s e responde 503', async () => {
    vi.useFakeTimers();
    try {
      const prov = provider((_query, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
      const pending = run(gateway(), prov, post(valid));
      await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS + 1);
      expect((await pending).status).toBe(503);
    } finally { vi.useRealTimers(); }
  });

  it('o log guarda só código e duração, nunca o endereço nem a pessoa', async () => {
    const log = vi.fn();
    await run(gateway(), provider(), post(valid), log);
    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(['code', 'durationMs']);
    expect(JSON.stringify(entry)).not.toContain('Praça');
  });
});
