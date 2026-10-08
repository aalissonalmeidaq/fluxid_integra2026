// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addressCacheKey, normalizeAddress } from '../../supabase/functions/geocode-address/address-cache';
import { isAutomatedTestEnvironment, loadGeocodingConfig, parseCacheTtlDays, parseRatePerSecond, providerWindowSeconds, readRuntimeEnv } from '../../supabase/functions/geocode-address/config';

// Configuração (GEOCODING_*) e cache da geocodificação do protótipo.

const envOf = (values: Record<string, string>) => (name: string) => values[name];

describe('loadGeocodingConfig', () => {
  it('sem variáveis, o padrão é seguro: desligada, Nominatim, sem pessoa física, com confirmação e 1 por segundo', () => {
    expect(loadGeocodingConfig(() => undefined)).toEqual({
      enabled: false, provider: 'nominatim', allowPersonalAddresses: false, requireConfirmation: true, ratePerSecond: 1, cacheTtlDays: 30,
    });
  });

  it('lê os valores do protótipo', () => {
    expect(loadGeocodingConfig(envOf({
      GEOCODING_ENABLED: 'true', GEOCODING_PROVIDER: 'nominatim', GEOCODING_ALLOW_PERSONAL_ADDRESSES: 'false',
      GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION: 'true', GEOCODING_RATE_LIMIT_PER_SECOND: '1', GEOCODING_CACHE_TTL_DAYS: '30',
    }))).toEqual({ enabled: true, provider: 'nominatim', allowPersonalAddresses: false, requireConfirmation: true, ratePerSecond: 1, cacheTtlDays: 30 });
  });

  it('só "true" liga e só "false" desliga; qualquer outro valor mantém o padrão seguro', () => {
    expect(loadGeocodingConfig(envOf({ GEOCODING_ENABLED: 'sim' })).enabled).toBe(false);
    expect(loadGeocodingConfig(envOf({ GEOCODING_ENABLED: ' TRUE ' })).enabled).toBe(true);
    expect(loadGeocodingConfig(envOf({ GEOCODING_ALLOW_PERSONAL_ADDRESSES: '1' })).allowPersonalAddresses).toBe(false);
    expect(loadGeocodingConfig(envOf({ GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION: 'talvez' })).requireConfirmation).toBe(true);
    expect(loadGeocodingConfig(envOf({ GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION: 'false' })).requireConfirmation).toBe(false);
  });

  it.each([['1', 1], ['0.5', 0.5], ['50', 1], ['0', 1], ['-3', 1], ['abc', 1], ['', 1], [undefined, 1]])('GEOCODING_RATE_LIMIT_PER_SECOND=%s vira %s (nunca acima de 1)', (value, expected) => {
    expect(parseRatePerSecond(value)).toBe(expected);
  });

  it.each([['7', 7], ['90', 90], ['91', 30], ['0', 30], ['-1', 30], ['1.5', 30], ['abc', 30], ['', 30], [undefined, 30]])('GEOCODING_CACHE_TTL_DAYS=%s vira %s (1 a 90 dias, padrão 30)', (value, expected) => {
    expect(parseCacheTtlDays(value)).toBe(expected);
  });

  it('a janela do balde global cresce quando a taxa é menor que 1 e nunca fica abaixo de 1 s', () => {
    expect(providerWindowSeconds(1)).toBe(1);
    expect(providerWindowSeconds(0.5)).toBe(2);
    expect(providerWindowSeconds(0.3)).toBe(4);
    expect(providerWindowSeconds(10)).toBe(1);
  });
});

describe('ambiente de testes automatizados', () => {
  it('é reconhecido por VITEST, NODE_ENV=test ou GEOCODING_BLOCK_REAL_CALLS=true', () => {
    expect(isAutomatedTestEnvironment(envOf({ VITEST: 'true' }))).toBe(true);
    expect(isAutomatedTestEnvironment(envOf({ NODE_ENV: 'test' }))).toBe(true);
    expect(isAutomatedTestEnvironment(envOf({ GEOCODING_BLOCK_REAL_CALLS: 'true' }))).toBe(true);
    expect(isAutomatedTestEnvironment(envOf({ NODE_ENV: 'production' }))).toBe(false);
    expect(isAutomatedTestEnvironment(() => undefined)).toBe(false);
  });

  it('por padrão lê o ambiente real do processo, onde o Vitest está ativo', () => {
    expect(isAutomatedTestEnvironment()).toBe(true);
    expect(readRuntimeEnv('VARIAVEL_QUE_NAO_EXISTE_NUNCA')).toBeUndefined();
  });
});

describe('chave do cache', () => {
  const base = { street: 'Praça da Sé', number: '100', city: 'São Paulo', state: 'SP', postal_code: '01001000' };

  it('é o hash SHA-256 do endereço normalizado, sem o texto do endereço', async () => {
    const key = await addressCacheKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('sao');
  });

  it('ignora caixa, acentos e espaços repetidos, mas distingue número e CEP', async () => {
    const mesmo = await addressCacheKey({ ...base, street: '  PRACA   DA SE ', city: 'SÃO PAULO' });
    expect(mesmo).toBe(await addressCacheKey(base));
    expect(await addressCacheKey({ ...base, number: '101' })).not.toBe(mesmo);
    expect(await addressCacheKey({ ...base, postal_code: '01001001' })).not.toBe(mesmo);
    expect(normalizeAddress(base)).toBe('praca da se|100|sao paulo|sp|01001000');
  });

});
