import { describe, it, expect, vi } from 'vitest';
import { resolveConnection } from '@/infrastructure/supabase/connection-resolver';
import { classifyOperationalError } from '@/infrastructure/supabase/failure-classifier';
import { AppConfig } from '@/config/environment';
import { MOCK_URLS, MOCK_KEYS } from '@/test/fixtures/connectivity';
import { HealthProbeResult } from '@/infrastructure/supabase/endpoint-health';

describe('Integração de Conectividade: Indisponibilidade vs Bloqueio (História 3)', () => {
  const config: AppConfig = {
    connectionMode: 'auto',
    probeTimeoutMs: 1000,
    endpoints: [
      { kind: 'local', url: MOCK_URLS.local, publishableKey: MOCK_KEYS.local },
      { kind: 'lan', url: MOCK_URLS.lan, publishableKey: MOCK_KEYS.lan },
      { kind: 'cloud', url: MOCK_URLS.cloud, publishableKey: MOCK_KEYS.cloud },
    ],
  };

  it('permite fallback exclusivamente para falhas elegíveis (timeout, rede, 5xx)', async () => {
    const probeFn = vi.fn().mockImplementation(async (url: string): Promise<HealthProbeResult> => {
      if (url === MOCK_URLS.local) return { ok: false, failure: 'timeout' };
      if (url === MOCK_URLS.lan) return { ok: false, failure: 'service_unavailable', statusCode: 502 };
      if (url === MOCK_URLS.cloud) return { ok: true, statusCode: 200 };
      return { ok: false, failure: 'network' };
    });

    const result = await resolveConnection(config, { probeFn });

    expect(result.state).toBe('degraded');
    expect(result.selectedEndpoint).toBe('cloud');
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts[0]?.outcome).toBe('timeout');
    expect(result.attempts[1]?.outcome).toBe('service_unavailable');
    expect(result.attempts[2]?.outcome).toBe('success');
  });

  it('bloqueia e impede fallback quando o probe recebe erro 4xx', async () => {
    const probeFn = vi.fn().mockImplementation(async (url: string): Promise<HealthProbeResult> => {
      if (url === MOCK_URLS.local) return { ok: false, failure: 'configuration', statusCode: 401 };
      return { ok: true, statusCode: 200 };
    });

    const result = await resolveConnection(config, { probeFn });

    expect(result.state).toBe('blocked');
    expect(result.selectedEndpoint).toBeUndefined();
    expect(probeFn).toHaveBeenCalledTimes(1); // Não realizou fallback
  });

  it('erros operacionais após a seleção classificam como bloqueante e proíbem nova resolução automática', () => {
    // Simula erro de RLS / permissão no cliente ativo
    const rlsError = classifyOperationalError({ statusCode: 403, code: '42501' });
    expect(rlsError).toBe('authorization');

    const authError = classifyOperationalError({ statusCode: 401, code: 'PGRST301' });
    expect(authError).toBe('authentication');
  });
});
