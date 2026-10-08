// Configuração da geocodificação do protótipo. Integração TEMPORÁRIA e exclusiva do protótipo: o uso do Nominatim público
// é controlado por estas variáveis de ambiente, lidas só no servidor (Edge Function). Ver docs/geocodificacao-prototipo.md.

export interface GeocodingConfig {
  // GEOCODING_ENABLED: desligado por padrão; só o valor "true" liga.
  enabled: boolean;
  // GEOCODING_PROVIDER: nome registrado em `registry.ts` (padrão "nominatim").
  provider: string;
  // GEOCODING_ALLOW_PERSONAL_ADDRESSES: padrão false; endereços de cadastro de pessoa física ficam bloqueados.
  allowPersonalAddresses: boolean;
  // GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION: padrão true; só o valor "false" dispensa a confirmação explícita.
  requireConfirmation: boolean;
  // GEOCODING_RATE_LIMIT_PER_SECOND: limite global ao provedor; nunca acima de 1 requisição por segundo.
  ratePerSecond: number;
  // GEOCODING_CACHE_TTL_DAYS: retenção do cache server-side, de 1 a 90 dias (padrão 30).
  cacheTtlDays: number;
}

export type EnvReader = (name: string) => string | undefined;

export const MAX_RATE_PER_SECOND = 1;

const flag = (value: string | undefined, fallback: boolean): boolean => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
};

// Valor ausente, inválido ou acima do teto vira o teto (1 por segundo); frações pedem janelas maiores (0,5 = 1 a cada 2 s).
export function parseRatePerSecond(value: string | undefined): number {
  const parsed = Number(value?.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return MAX_RATE_PER_SECOND;
  return Math.min(parsed, MAX_RATE_PER_SECOND);
}

export const DEFAULT_CACHE_TTL_DAYS = 30;
export const MAX_CACHE_TTL_DAYS = 90;

// Valor ausente, não inteiro ou fora de 1..90 volta ao padrão: o prazo do cache nunca fica indefinido nem ilimitado.
export function parseCacheTtlDays(value: string | undefined): number {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_CACHE_TTL_DAYS ? parsed : DEFAULT_CACHE_TTL_DAYS;
}

export function loadGeocodingConfig(read: EnvReader): GeocodingConfig {
  return {
    enabled: flag(read('GEOCODING_ENABLED'), false),
    provider: read('GEOCODING_PROVIDER')?.trim().toLowerCase() || 'nominatim',
    allowPersonalAddresses: flag(read('GEOCODING_ALLOW_PERSONAL_ADDRESSES'), false),
    requireConfirmation: flag(read('GEOCODING_REQUIRE_TRANSMISSION_CONFIRMATION'), true),
    ratePerSecond: parseRatePerSecond(read('GEOCODING_RATE_LIMIT_PER_SECOND')),
    cacheTtlDays: parseCacheTtlDays(read('GEOCODING_CACHE_TTL_DAYS')),
  };
}

// Janela (em segundos) do balde global: 1 requisição por janela, no máximo uma por segundo.
export const providerWindowSeconds = (ratePerSecond: number): number => Math.max(1, Math.ceil(1 / Math.min(ratePerSecond, MAX_RATE_PER_SECOND)));

interface RuntimeGlobals {
  Deno?: { env: { get(name: string): string | undefined } };
  process?: { env: Record<string, string | undefined> };
}

// Lê a variável no Deno (Edge Function) ou, nos testes, no Node.
export const readRuntimeEnv: EnvReader = (name) => {
  const runtime = globalThis as RuntimeGlobals;
  try {
    return runtime.Deno?.env.get(name) ?? runtime.process?.env[name];
  } catch {
    return undefined;
  }
};

// Testes automatizados nunca podem chegar ao serviço real: o Vitest define VITEST/NODE_ENV=test e a CI define GEOCODING_BLOCK_REAL_CALLS.
export function isAutomatedTestEnvironment(read: EnvReader = readRuntimeEnv): boolean {
  return Boolean(read('VITEST')) || read('NODE_ENV') === 'test' || flag(read('GEOCODING_BLOCK_REAL_CALLS'), false);
}
