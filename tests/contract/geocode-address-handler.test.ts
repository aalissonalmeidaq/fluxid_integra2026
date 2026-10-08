// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadGeocodingConfig, type GeocodingConfig } from '../../supabase/functions/geocode-address/config';
import {
  createGeocodeAddressHandler, LIMITS, PROVIDER_TIMEOUT_MS, type GeocodeGateway, type GeocodeLogEvent, type GeocodingProvider,
} from '../../supabase/functions/geocode-address/handler';
import { GeocodingBlockedError, GeocodingProviderError } from '../../supabase/functions/geocode-address/provider';
import { NominatimProvider } from '../../supabase/functions/geocode-address/nominatim-provider';
import { createGeocodingProvider } from '../../supabase/functions/geocode-address/registry';

// Spec 007, US1: função geocode-address (RF-065 a RF-068). Integração temporária do protótipo. O provedor é sempre falso: o CI
// nunca chama o Nominatim real.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const ORG_B = '20000000-0000-4000-8000-00000000000b';
const CUSTOMER = '81000000-0000-4000-8000-00000000000a';
const ADDRESS = { street: 'Praça da Sé', number: '100', city: 'São Paulo', state: 'SP', postal_code: '01001000' };
const LOCATION = { latitude: -23.550453, longitude: -46.633911, display_name: 'Praça da Sé, São Paulo', precision: 'address' as const };
const CONFIG: GeocodingConfig = { enabled: true, provider: 'nominatim', allowPersonalAddresses: false, requireConfirmation: true, ratePerSecond: 1, cacheTtlDays: 30 };

type Gateway = GeocodeGateway & {
  authenticate: ReturnType<typeof vi.fn>; checkPermission: ReturnType<typeof vi.fn>; takeToken: ReturnType<typeof vi.fn>;
  findCustomer: ReturnType<typeof vi.fn>; readCache: ReturnType<typeof vi.fn>; writeCache: ReturnType<typeof vi.fn>;
};
const gateway = (overrides: Partial<GeocodeGateway> = {}): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION })),
  checkPermission: vi.fn(async () => 'OK' as const),
  takeToken: vi.fn(async () => true),
  findCustomer: vi.fn(async () => ({ personType: 'legal' as const, operable: true })),
  readCache: vi.fn(async () => null),
  writeCache: vi.fn(async () => undefined),
  ...overrides,
}) as never;

type Provider = GeocodingProvider & { geocode: ReturnType<typeof vi.fn> };
const provider = (impl: GeocodingProvider['geocode'] = async () => LOCATION, name = 'nominatim'): Provider => ({ name, geocode: vi.fn(impl) }) as never;

const post = (body: unknown, token: string | undefined = 'jwt', method = 'POST') =>
  new Request('http://local/fn', {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
const run = (gw: Gateway, prov: GeocodingProvider | null, request: Request, log: (event: GeocodeLogEvent) => void = vi.fn(), config: Partial<GeocodingConfig> = {}) =>
  createGeocodeAddressHandler({ gateway: gw, provider: prov, config: { ...CONFIG, ...config }, log, newOperationId: () => 'op-1' })(request);
const body = (response: Response) => response.json() as Promise<Record<string, unknown>>;
const valid = { organization_id: ORG, customer_id: CUSTOMER, consent_confirmed: true, ...ADDRESS };

describe('geocode-address: unidade comercial autorizada', () => {
  it('devolve a localização, normaliza o CEP e envia ao provedor só logradouro, número, cidade, UF e CEP', async () => {
    const prov = provider();
    const response = await run(gateway(), prov, post({ ...valid, postal_code: '01001-000' }));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ code: 'FOUND', location: LOCATION, cached: false });
    expect(prov.geocode.mock.calls[0]?.[0]).toEqual(ADDRESS);
    expect(prov.geocode.mock.calls[0]).toHaveLength(2);
  });

  it('endereço que o provedor não acha é NOT_FOUND com HTTP 200 e não vai para o cache', async () => {
    const gw = gateway();
    const response = await run(gw, provider(async () => 'NOT_FOUND'), post(valid));
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ code: 'NOT_FOUND' });
    expect(gw.writeCache).not.toHaveBeenCalled();
  });

  it('nome, documento, contatos, motorista, cliente, organização, bairro, cilindro e instruções nunca chegam ao provedor', async () => {
    const prov = provider();
    await run(gateway(), prov, post({
      ...valid, name: 'Hospital Alfa', document: '11222333000181', phone: '1199999999', email: 'a@b.co', driver: 'João', district: 'Sé',
      cylinder_identifier: 'CIL-9', receiving_contact_name: 'Maria', access_instructions: 'portão 2', latitude: 1, longitude: 2,
    }));
    expect(Object.keys(prov.geocode.mock.calls[0]?.[0] as object).sort()).toEqual(['city', 'number', 'postal_code', 'state', 'street']);
    expect(JSON.stringify(prov.geocode.mock.calls[0]?.[0])).not.toMatch(/Hospital|11222333000181|CIL-9|Maria|João|portão/);
  });
});

describe('geocode-address: bloqueios antes de qualquer chamada externa', () => {
  const blocked = async (response: Response, status: number, code: string, prov: Provider, gw?: Gateway) => {
    expect(response.status).toBe(status);
    expect((await body(response)).code).toBe(code);
    expect(prov.geocode).not.toHaveBeenCalled();
    if (gw) expect(gw.writeCache).not.toHaveBeenCalled();
  };

  it('cadastro de pessoa física é bloqueado, sem cache nem consumo do limite do provedor', async () => {
    const prov = provider();
    const gw = gateway({ findCustomer: vi.fn(async () => ({ personType: 'individual' as const, operable: true })) });
    await blocked(await run(gw, prov, post(valid)), 403, 'PERSONAL_ADDRESS_NOT_ALLOWED', prov, gw);
    expect(gw.takeToken).not.toHaveBeenCalled();
    expect(gw.readCache).not.toHaveBeenCalled();
  });

  it('cliente de outra organização (não encontrado nela) é bloqueado com 404 e a consulta usa a organização informada', async () => {
    const prov = provider();
    const gw = gateway({ findCustomer: vi.fn(async (organizationId: string) => (organizationId === ORG_B ? { personType: 'legal' as const, operable: true } : null)) });
    await blocked(await run(gw, prov, post(valid)), 404, 'NOT_FOUND', prov);
    expect(gw.findCustomer).toHaveBeenCalledWith(ORG, CUSTOMER);
  });

  it.each([['inativo ou anonimizado', false]])('cliente %s: 409 CUSTOMER_NOT_OPERABLE, sem limite nem provedor', async (_name, operable) => {
    const prov = provider();
    const gw = gateway({ findCustomer: vi.fn(async () => ({ personType: 'legal' as const, operable })) });
    await blocked(await run(gw, prov, post(valid)), 409, 'CUSTOMER_NOT_OPERABLE', prov);
    expect(gw.takeToken).not.toHaveBeenCalled();
  });

  it('o prazo do cache configurado (GEOCODING_CACHE_TTL_DAYS) segue para a gravação', async () => {
    const gw = gateway();
    await run(gw, provider(), post(valid), vi.fn(), { cacheTtlDays: 7 });
    expect(gw.writeCache).toHaveBeenCalledWith(ORG, expect.any(String), LOCATION, 7);
  });

  it('o tipo de pessoa vem do banco, não do corpo: um person_type falso no corpo não libera nada', async () => {
    const prov = provider();
    const gw = gateway({ findCustomer: vi.fn(async () => ({ personType: 'individual' as const, operable: true })) });
    await blocked(await run(gw, prov, post({ ...valid, person_type: 'legal' })), 403, 'PERSONAL_ADDRESS_NOT_ALLOWED', prov);
    expect(gw.findCustomer).toHaveBeenCalledWith(ORG, CUSTOMER);
  });

  it('GEOCODING_ALLOW_PERSONAL_ADDRESSES=true libera a pessoa física', async () => {
    const prov = provider();
    const gw = gateway({ findCustomer: vi.fn(async () => ({ personType: 'individual' as const, operable: true })) });
    expect((await run(gw, prov, post(valid), vi.fn(), { allowPersonalAddresses: true })).status).toBe(200);
    expect(prov.geocode).toHaveBeenCalledTimes(1);
  });

  it('cliente que não existe na organização: 404', async () => {
    const prov = provider();
    await blocked(await run(gateway({ findCustomer: vi.fn(async () => null) }), prov, post(valid)), 404, 'NOT_FOUND', prov);
  });

  it('falha ao consultar o tipo de pessoa é erro interno, nunca liberação', async () => {
    const prov = provider();
    await blocked(await run(gateway({ findCustomer: vi.fn(async () => { throw new Error('x'); }) }), prov, post(valid)), 500, 'INTERNAL_ERROR', prov);
  });

  it('confirmação não fornecida: 428, sem consultar permissão, limite nem provedor', async () => {
    const prov = provider();
    const gw = gateway();
    for (const consent of [undefined, false, 'true', 1, null]) {
      const response = await run(gw, prov, post({ ...valid, consent_confirmed: consent }));
      expect(response.status).toBe(428);
      expect((await body(response)).code).toBe('CONFIRMATION_REQUIRED');
    }
    expect(gw.checkPermission).not.toHaveBeenCalled();
    expect(gw.takeToken).not.toHaveBeenCalled();
    expect(prov.geocode).not.toHaveBeenCalled();
  });

  it('GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION=false dispensa a confirmação', async () => {
    const prov = provider();
    const semConfirmacao = { organization_id: ORG, customer_id: CUSTOMER, ...ADDRESS };
    expect((await run(gateway(), prov, post(semConfirmacao), vi.fn(), { requireConfirmation: false })).status).toBe(200);
  });

  it('funcionalidade desligada (GEOCODING_ENABLED): 403 FEATURE_DISABLED, sem nenhuma consulta', async () => {
    const prov = provider();
    const gw = gateway();
    await blocked(await run(gw, prov, post(valid), vi.fn(), { enabled: false }), 403, 'FEATURE_DISABLED', prov);
    expect(gw.checkPermission).not.toHaveBeenCalled();
    expect(gw.findCustomer).not.toHaveBeenCalled();
    expect(gw.takeToken).not.toHaveBeenCalled();
  });

  it('desligada, ainda exige sessão: sem token, 401', async () => {
    expect((await run(gateway(), provider(), post(valid, ''), vi.fn(), { enabled: false })).status).toBe(401);
  });

  it.each([
    ['sem logradouro', { street: '' }], ['sem número', { number: '' }], ['sem cidade', { city: '' }], ['sem CEP', { postal_code: '' }], ['sem UF', { state: '' }],
    ['UF inválida', { state: 'XX' }], ['UF minúscula', { state: 'sp' }], ['CEP malformado', { postal_code: '0100' }],
    ['logradouro longo demais', { street: 'a'.repeat(121) }], ['número que não é texto', { number: 10 }],
  ])('endereço incompleto (%s): 400 ADDRESS_INCOMPLETE sem chamar o provedor nem consumir limite', async (_name, patch) => {
    const prov = provider();
    const gw = gateway();
    const response = await run(gw, prov, post({ ...valid, ...patch }));
    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({ code: 'ADDRESS_INCOMPLETE', fields: [{ field: expect.any(String) }] });
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

  it('organização ou cliente que não são UUID, ou corpo que não é objeto: 400', async () => {
    const prov = provider();
    expect((await run(gateway(), prov, post({ ...valid, organization_id: 'abc' }))).status).toBe(400);
    expect((await run(gateway(), prov, post({ ...valid, customer_id: 'abc' }))).status).toBe(400);
    expect((await run(gateway(), prov, post([1]))).status).toBe(400);
    expect(prov.geocode).not.toHaveBeenCalled();
  });

  it('sem a permissão: 403, sem consultar o cliente, consumir limite nem chamar o provedor', async () => {
    const prov = provider();
    const gw = gateway({ checkPermission: vi.fn(async () => 'ACCESS_DENIED' as const) });
    expect((await run(gw, prov, post(valid))).status).toBe(403);
    expect(gw.findCustomer).not.toHaveBeenCalled();
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

describe('geocode-address: cache por organização', () => {
  it('erro de cache (miss): consulta o provedor e grava a resposta com a chave do endereço normalizado', async () => {
    const gw = gateway();
    const prov = provider();
    const response = await run(gw, prov, post(valid));
    expect((await body(response)).cached).toBe(false);
    expect(prov.geocode).toHaveBeenCalledTimes(1);
    expect(gw.writeCache).toHaveBeenCalledWith(ORG, expect.stringMatching(/^[0-9a-f]{64}$/), LOCATION, 30);
  });

  it('acerto de cache (hit): não chama o provedor nem gasta o limite global, e marca cached=true', async () => {
    const gw = gateway({ readCache: vi.fn(async () => LOCATION) });
    const prov = provider();
    const response = await run(gw, prov, post(valid));
    expect(await body(response)).toEqual({ code: 'FOUND', location: LOCATION, cached: true });
    expect(prov.geocode).not.toHaveBeenCalled();
    expect(gw.takeToken).not.toHaveBeenCalledWith(LIMITS.provider.bucket, expect.anything(), expect.anything(), expect.anything());
    expect(gw.writeCache).not.toHaveBeenCalled();
  });

  it('o acerto ainda respeita autorização, tipo de pessoa e limites individuais', async () => {
    const gw = gateway({ readCache: vi.fn(async () => LOCATION), takeToken: vi.fn(async (b: string) => b !== 'geocode:user') });
    expect((await run(gw, provider(), post(valid))).status).toBe(429);
    expect(gw.readCache).not.toHaveBeenCalled();
  });

  it('a chave é a mesma para variações de caixa, acento e espaços, e muda com a organização na consulta', async () => {
    const gw = gateway();
    await run(gw, provider(), post(valid));
    await run(gw, provider(), post({ ...valid, street: '  PRAÇA  DA   SE ', city: 'sao paulo' }));
    await run(gw, provider(), post({ ...valid, organization_id: ORG_B }));
    const keys = gw.readCache.mock.calls.map((call) => call[1]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBe(keys[0]);
    expect(gw.readCache.mock.calls.map((call) => call[0])).toEqual([ORG, ORG, ORG_B]);
  });

  it('endereço diferente gera outra chave', async () => {
    const gw = gateway();
    await run(gw, provider(), post(valid));
    await run(gw, provider(), post({ ...valid, number: '200' }));
    expect(gw.readCache.mock.calls[0]?.[1]).not.toBe(gw.readCache.mock.calls[1]?.[1]);
  });

  it('falha ao ler ou gravar o cache nunca bloqueia a consulta', async () => {
    const gw = gateway({ readCache: vi.fn(async () => { throw new Error('x'); }), writeCache: vi.fn(async () => { throw new Error('x'); }) });
    const response = await run(gw, provider(), post(valid));
    expect(response.status).toBe(200);
    expect((await body(response)).code).toBe('FOUND');
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

  it('o teto configurado nunca passa de 1 por segundo; valores menores alargam a janela', async () => {
    const acima = gateway();
    await run(acima, provider(), post(valid), vi.fn(), loadGeocodingConfig((name) => ({ GEOCODING_ENABLED: 'true', GEOCODING_RATE_LIMIT_PER_SECOND: '50' } as Record<string, string>)[name]));
    expect(acima.takeToken).toHaveBeenCalledWith('geocode:provider', 'nominatim', 1, 1);
    const metade = gateway({ takeToken: vi.fn(async (b: string) => b !== 'geocode:provider') });
    const response = await run(metade, provider(), post(valid), vi.fn(), { ratePerSecond: 0.5 });
    expect(await body(response)).toEqual({ code: 'RATE_LIMITED', retry_after_seconds: 2 });
  });

  it('falha do banco ao contar o limite é erro interno', async () => {
    expect((await run(gateway({ takeToken: vi.fn(async () => { throw new Error('x'); }) }), provider(), post(valid))).status).toBe(500);
  });
});

describe('geocode-address: falhas do provedor nunca bloqueiam o cadastro', () => {
  it('erro do provedor (indisponibilidade): 503 SERVICE_UNAVAILABLE', async () => {
    const response = await run(gateway(), provider(async () => { throw new GeocodingProviderError('provider_status'); }), post(valid));
    expect(response.status).toBe(503);
    expect((await body(response)).code).toBe('SERVICE_UNAVAILABLE');
  });

  it('tempo esgotado: aborta o sinal em 4 s e responde 503 com o código provider_timeout no registro', async () => {
    vi.useFakeTimers();
    try {
      const log = vi.fn();
      const prov = provider((_query, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))));
      const pending = run(gateway(), prov, post(valid), log);
      // O hash da chave do cache é assíncrono de verdade: o temporizador do provedor só existe depois dele.
      await vi.waitFor(() => expect(prov.geocode).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS + 1);
      expect((await pending).status).toBe(503);
      expect(log.mock.calls[0]?.[0]).toMatchObject({ status: 503, errorCode: 'provider_timeout' });
    } finally { vi.useRealTimers(); }
  });

  it('provedor não registrado na configuração: 503, sem trocar de provedor às escondidas', async () => {
    const response = await run(gateway(), null, post(valid), vi.fn(), { provider: 'inexistente' });
    expect(response.status).toBe(503);
  });

  it('chamada real durante testes automatizados: 403 TEST_ENVIRONMENT_BLOCKED, sem tentar a rede', async () => {
    const response = await run(gateway(), provider(async () => { throw new GeocodingBlockedError('TEST_ENVIRONMENT_BLOCKED'); }), post(valid));
    expect(response.status).toBe(403);
    expect((await body(response)).code).toBe('TEST_ENVIRONMENT_BLOCKED');
  });
});

describe('geocode-address: registro de operação sem endereço (RF-068)', () => {
  it('sem relógio nem gerador injetados, usa o relógio do sistema e um UUID por operação', async () => {
    const log = vi.fn();
    await createGeocodeAddressHandler({ gateway: gateway(), provider: provider(), config: CONFIG, log })(post(valid));
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      operationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/), durationMs: expect.any(Number), status: 200,
    });
  });

  const SECRETS = /Praça|Sé|São Paulo|01001|nominatim\.openstreetmap|street=|Hospital|11222333000181|João|CIL-9/;

  it('guarda só identificador, provedor, duração, status e código de erro', async () => {
    const log = vi.fn();
    await run(gateway(), provider(), post(valid), log);
    expect(log).toHaveBeenCalledTimes(1);
    const entry = log.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(['durationMs', 'errorCode', 'operationId', 'provider', 'status']);
    expect(entry).toEqual({ operationId: 'op-1', provider: 'nominatim', durationMs: expect.any(Number), status: 200, errorCode: null });
  });

  it('o registro de erro do provedor traz só o código sanitizado, nunca a mensagem original', async () => {
    const log = vi.fn();
    await run(gateway(), provider(async () => { throw new Error('fetch failed https://nominatim.openstreetmap.org/search?street=100+Praça+da+Sé'); }), post(valid), log);
    const entry = log.mock.calls[0]?.[0] as GeocodeLogEvent;
    expect(entry).toMatchObject({ status: 503, errorCode: 'provider_error' });
    expect(JSON.stringify(entry)).not.toMatch(SECRETS);
  });

  it('em todos os cenários o registro não contém endereço, URL, cliente, organização nem pessoa', async () => {
    const cenarios: Array<[string, Gateway, Provider, Record<string, unknown>, Partial<GeocodingConfig>]> = [
      ['sucesso', gateway(), provider(), valid, {}],
      ['hit', gateway({ readCache: vi.fn(async () => LOCATION) }), provider(), valid, {}],
      ['pessoa física', gateway({ findCustomer: vi.fn(async () => ({ personType: 'individual' as const, operable: true })) }), provider(), valid, {}],
      ['sem confirmação', gateway(), provider(), { ...valid, consent_confirmed: false }, {}],
      ['desligada', gateway(), provider(), valid, { enabled: false }],
      ['incompleto', gateway(), provider(), { ...valid, number: '' }, {}],
      ['limite', gateway({ takeToken: vi.fn(async () => false) }), provider(), valid, {}],
      ['falha com URL', gateway(), provider(async () => { throw new Error('https://nominatim.openstreetmap.org/search?street=100+Praça'); }), valid, {}],
    ];
    for (const [, gw, prov, payload, cfg] of cenarios) {
      const log = vi.fn();
      await run(gw, prov, post(payload), log, cfg);
      const serialized = JSON.stringify(log.mock.calls);
      expect(serialized).not.toMatch(SECRETS);
      expect(serialized).not.toContain(ORG);
      expect(serialized).not.toContain(CUSTOMER);
      expect(serialized).not.toContain(USER);
    }
  });
});

describe('geocode-address: troca do provedor por configuração', () => {
  it('GEOCODING_PROVIDER escolhe a implementação registrada; o manipulador usa o nome dela para o balde e o registro', async () => {
    const outro = provider(async () => LOCATION, 'outro-servico');
    const escolhido = createGeocodingProvider('outro-servico', { 'outro-servico': () => outro });
    expect(escolhido).toBe(outro);
    const gw = gateway();
    const log = vi.fn();
    const response = await run(gw, escolhido, post(valid), log, { provider: 'outro-servico' });
    expect(response.status).toBe(200);
    expect(outro.geocode).toHaveBeenCalledTimes(1);
    expect(gw.takeToken).toHaveBeenCalledWith('geocode:provider', 'outro-servico', 1, 1);
    expect(log.mock.calls[0]?.[0]).toMatchObject({ provider: 'outro-servico' });
  });

  it('o padrão registrado é o Nominatim, e um nome desconhecido devolve null (nunca outro provedor)', () => {
    expect(createGeocodingProvider('nominatim')).toBeInstanceOf(NominatimProvider);
    expect(createGeocodingProvider('desconhecido')).toBeNull();
    expect(createGeocodingProvider('toString')).toBeNull();
    expect(loadGeocodingConfig(() => undefined).provider).toBe('nominatim');
    expect(loadGeocodingConfig((name) => (name === 'GEOCODING_PROVIDER' ? ' Outro ' : undefined)).provider).toBe('outro');
  });

  it('a resposta ao frontend é a mesma, qualquer que seja o provedor', async () => {
    const a = await body(await run(gateway(), provider(async () => LOCATION, 'nominatim'), post(valid)));
    const b = await body(await run(gateway(), provider(async () => LOCATION, 'outro'), post(valid)));
    expect(a).toEqual(b);
  });
});
