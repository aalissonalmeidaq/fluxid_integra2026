import { describe, it, expect, vi } from 'vitest';
import { resolveCloudFirst } from '@/infrastructure/connectivity/cloud-first-connection-resolver';
import type { ConnectionFailure } from '@/infrastructure/connectivity/connection-failure-classifier';
import { classifyOperationalError } from '@/infrastructure/supabase/failure-classifier';
import { MOCK_URLS, MOCK_KEYS } from '@/test/fixtures/connectivity';

type Inspection = { ok: true } | { ok: false; failure: ConnectionFailure; fallbackAllowed: boolean };

const config = {
  mode: 'auto' as const,
  probeTimeoutMs: 1000,
  contractVersion: '1',
  endpoints: [
    { kind: 'cloud' as const, url: MOCK_URLS.cloud, publishableKey: MOCK_KEYS.cloud },
    { kind: 'lan' as const, url: MOCK_URLS.lan, publishableKey: MOCK_KEYS.lan },
    { kind: 'local' as const, url: MOCK_URLS.local, publishableKey: MOCK_KEYS.local },
  ],
};

describe('Integração de Conectividade: Indisponibilidade vs Bloqueio (História 3)', () => {
  it('permite fallback exclusivamente para falhas elegíveis (timeout, rede, 5xx)', async () => {
    const inspect = vi.fn(async (endpoint: { url: string }): Promise<Inspection> => {
      if (endpoint.url === MOCK_URLS.cloud) return { ok: false, failure: 'timeout', fallbackAllowed: true };
      if (endpoint.url === MOCK_URLS.lan) return { ok: false, failure: 'service_unavailable', fallbackAllowed: true };
      return { ok: true };
    });

    const result = await resolveCloudFirst(config, { inspect });

    expect(result.state).toBe('degraded');
    expect(result).toMatchObject({ selectedEndpoint: 'local' });
    expect(result.attempts.map((attempt) => attempt.endpoint)).toEqual(['cloud', 'lan', 'local']);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['timeout', 'service_unavailable', 'success']);
  });

  it('bloqueia e impede fallback quando a cloud recusa por configuração ou autorização', async () => {
    const inspect = vi.fn(async (endpoint: { url: string }): Promise<Inspection> => {
      if (endpoint.url === MOCK_URLS.cloud) return { ok: false, failure: 'configuration', fallbackAllowed: false };
      return { ok: true };
    });

    const result = await resolveCloudFirst(config, { inspect });

    expect(result.state).toBe('blocked');
    expect('selectedEndpoint' in result).toBe(false);
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('erros operacionais após a seleção classificam como bloqueante e proíbem nova resolução automática', () => {
    expect(classifyOperationalError({ statusCode: 403, code: '42501' })).toBe('authorization');
    expect(classifyOperationalError({ statusCode: 401, code: 'PGRST301' })).toBe('authentication');
  });
});
