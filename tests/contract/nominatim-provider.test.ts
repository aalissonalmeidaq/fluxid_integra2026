// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NOMINATIM_BASE_URL, NominatimProvider, USER_AGENT, type FetchLike } from '../../supabase/functions/geocode-address/nominatim-provider';
import { GeocodingBlockedError, GeocodingProviderError } from '../../supabase/functions/geocode-address/provider';

// Adaptador do Nominatim (RF-065, CA-018). Nunca chama a rede: o CI usa só respostas gravadas.

const signal = new AbortController().signal;
const QUERY = { street: 'Praça da Sé', number: '100', city: 'São Paulo', state: 'SP', postal_code: '01001000' };
const HIT = { lat: '-23.5504533', lon: '-46.6339112', display_name: 'Praça da Sé, Sé, São Paulo, SP, 01001-000, Brasil', addresstype: 'house' };

const fetcherOf = (status: number, body: unknown): FetchLike & ReturnType<typeof vi.fn> =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as never;

describe('NominatimProvider: o que sai para o provedor (RF-065, CA-018)', () => {
  it('só logradouro, número, cidade, UF, CEP e país na query, GET, sem corpo, com identificação do aplicativo', async () => {
    const fetcher = fetcherOf(200, [HIT]);
    await new NominatimProvider(fetcher).geocode(QUERY, signal);
    const [url, init] = fetcher.mock.calls[0] as [string, { method: string; headers: Record<string, string>; signal: AbortSignal; body?: unknown }];
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`${NOMINATIM_BASE_URL}/search`);
    expect([...parsed.searchParams.keys()].sort()).toEqual(['addressdetails', 'city', 'country', 'countrycodes', 'format', 'limit', 'postalcode', 'state', 'street']);
    expect(parsed.searchParams.get('street')).toBe('100 Praça da Sé');
    expect(parsed.searchParams.get('city')).toBe('São Paulo');
    expect(parsed.searchParams.get('state')).toBe('SP');
    expect(parsed.searchParams.get('postalcode')).toBe('01001000');
    expect(parsed.searchParams.get('countrycodes')).toBe('br');
    expect(parsed.searchParams.get('country')).toBe('Brasil');
    expect(init.method).toBe('GET');
    expect(init.headers['user-agent']).toBe(USER_AGENT);
    expect(init.body).toBeUndefined();
    expect(init.signal).toBe(signal);
  });

  it('devolve latitude, longitude, endereço normalizado e precisão', async () => {
    const result = await new NominatimProvider(fetcherOf(200, [HIT])).geocode(QUERY, signal);
    expect(result).toEqual({ latitude: -23.550453, longitude: -46.633911, display_name: HIT.display_name, precision: 'address' });
  });

  it.each([['road', 'street'], ['suburb', 'locality'], ['city', 'locality'], ['building', 'address']])('addresstype %s vira precisão %s', async (type, precision) => {
    const result = await new NominatimProvider(fetcherOf(200, [{ ...HIT, addresstype: type }])).geocode(QUERY, signal);
    expect(result).toMatchObject({ precision });
  });

  it('lista vazia é NOT_FOUND', async () => {
    expect(await new NominatimProvider(fetcherOf(200, [])).geocode(QUERY, signal)).toBe('NOT_FOUND');
  });

  it.each([
    ['status 500', 500, []],
    ['status 429', 429, []],
    ['JSON inválido', 200, 'não é json'],
    ['corpo que não é lista', 200, { erro: true }],
    ['latitude fora do intervalo', 200, [{ ...HIT, lat: '123' }]],
    ['longitude não numérica', 200, [{ ...HIT, lon: 'abc' }]],
  ])('falha do provedor (%s) lança para virar "serviço indisponível"', async (_name, status, body) => {
    await expect(new NominatimProvider(fetcherOf(status, body)).geocode(QUERY, signal)).rejects.toBeInstanceOf(GeocodingProviderError);
  });

  it('indisponibilidade da rede vira código fixo, sem a mensagem original (que poderia trazer a URL)', async () => {
    const quebrado: FetchLike = async () => { throw new Error('getaddrinfo ENOTFOUND https://nominatim.openstreetmap.org/search?street=100+Pra%C3%A7a'); };
    const error = await new NominatimProvider(quebrado).geocode(QUERY, signal).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'provider_network', message: 'provider_network' });
  });

  it('tempo esgotado (sinal abortado) vira provider_timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    const abortado: FetchLike = async () => { throw new Error('aborted'); };
    await expect(new NominatimProvider(abortado).geocode(QUERY, controller.signal)).rejects.toMatchObject({ code: 'provider_timeout' });
  });

  it('endereço sem cidade ou UF válida nunca chega à rede', async () => {
    const fetcher = fetcherOf(200, [HIT]);
    await expect(new NominatimProvider(fetcher).geocode({ ...QUERY, city: '' }, signal)).rejects.toBeInstanceOf(GeocodingProviderError);
    await expect(new NominatimProvider(fetcher).geocode({ ...QUERY, state: 'XX' }, signal)).rejects.toBeInstanceOf(GeocodingProviderError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('o nome do provedor é nominatim', () => {
    expect(new NominatimProvider(fetcherOf(200, [])).name).toBe('nominatim');
  });
});

describe('NominatimProvider: nenhuma chamada real durante os testes automatizados', () => {
  it('sem fetcher injetado, a chamada real é bloqueada e a rede nunca é tocada', async () => {
    const rede = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(new NominatimProvider().geocode(QUERY, signal)).rejects.toBeInstanceOf(GeocodingBlockedError);
      await expect(new NominatimProvider().geocode(QUERY, signal)).rejects.toMatchObject({ code: 'TEST_ENVIRONMENT_BLOCKED' });
      expect(rede).not.toHaveBeenCalled();
    } finally {
      rede.mockRestore();
    }
  });

  it('fora de testes automatizados, o adaptador usa o fetch do ambiente (aqui trocado por um dubleDeFetch, sem rede)', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'production');
    const dubleDeFetch = vi.fn(async (_url: string) => new Response(JSON.stringify([HIT]), { status: 200 }));
    vi.stubGlobal('fetch', dubleDeFetch);
    try {
      expect(await new NominatimProvider().geocode(QUERY, signal)).toMatchObject({ precision: 'address' });
      expect(dubleDeFetch).toHaveBeenCalledTimes(1);
      expect(String(dubleDeFetch.mock.calls[0]?.[0])).toContain(NOMINATIM_BASE_URL);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('o ambiente de testes é reconhecido (Vitest) e a proteção da suíte também recusa o fetch direto ao Nominatim', async () => {
    expect(process.env.VITEST).toBeTruthy();
    await expect(fetch(`${NOMINATIM_BASE_URL}/search?q=x`)).rejects.toThrow(/Nominatim/);
  });
});
