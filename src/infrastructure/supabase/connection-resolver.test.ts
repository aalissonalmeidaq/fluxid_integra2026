import { describe, it, expect, vi } from 'vitest';
import { resolveConnection } from './connection-resolver';
import { AppConfig } from '@/config/environment';
import { MOCK_URLS, MOCK_KEYS } from '@/test/fixtures/connectivity';
import { HealthProbeResult } from './endpoint-health';

describe('Resolvedor de Conectividade (Connection Resolver)', () => {
  const mockConfigAuto: AppConfig = {
    connectionMode: 'auto',
    probeTimeoutMs: 2000,
    endpoints: [
      { kind: 'local', url: MOCK_URLS.local, publishableKey: MOCK_KEYS.local },
      { kind: 'lan', url: MOCK_URLS.lan, publishableKey: MOCK_KEYS.lan },
      { kind: 'cloud', url: MOCK_URLS.cloud, publishableKey: MOCK_KEYS.cloud },
    ],
  };

  it('no modo auto seleciona local como connected quando disponível', async () => {
    const probeFn = vi.fn().mockImplementation(async (url: string): Promise<HealthProbeResult> => {
      if (url === MOCK_URLS.local) return { ok: true, statusCode: 200 };
      return { ok: false, failure: 'timeout' };
    });

    const result = await resolveConnection(mockConfigAuto, { probeFn });

    expect(result.state).toBe('connected');
    expect(result.selectedEndpoint).toBe('local');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.endpoint).toBe('local');
    expect(result.attempts[0]?.outcome).toBe('success');
    expect(probeFn).toHaveBeenCalledTimes(1);
  });

  it('no modo auto faz fallback para LAN com estado degraded quando local falha por timeout', async () => {
    const probeFn = vi.fn().mockImplementation(async (url: string): Promise<HealthProbeResult> => {
      if (url === MOCK_URLS.local) return { ok: false, failure: 'timeout' };
      if (url === MOCK_URLS.lan) return { ok: true, statusCode: 200 };
      return { ok: false, failure: 'timeout' };
    });

    const result = await resolveConnection(mockConfigAuto, { probeFn });

    expect(result.state).toBe('degraded');
    expect(result.selectedEndpoint).toBe('lan');
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.outcome).toBe('timeout');
    expect(result.attempts[1]?.outcome).toBe('success');
    expect(probeFn).toHaveBeenCalledTimes(2);
  });

  it('no modo auto faz fallback para Cloud com estado degraded quando local e LAN falham', async () => {
    const probeFn = vi.fn().mockImplementation(async (url: string): Promise<HealthProbeResult> => {
      if (url === MOCK_URLS.local) return { ok: false, failure: 'network' };
      if (url === MOCK_URLS.lan) return { ok: false, failure: 'service_unavailable', statusCode: 503 };
      if (url === MOCK_URLS.cloud) return { ok: true, statusCode: 200 };
      return { ok: false, failure: 'timeout' };
    });

    const result = await resolveConnection(mockConfigAuto, { probeFn });

    expect(result.state).toBe('degraded');
    expect(result.selectedEndpoint).toBe('cloud');
    expect(result.attempts).toHaveLength(3);
    expect(probeFn).toHaveBeenCalledTimes(3);
  });

  it('no modo auto vai para offline quando todos os endpoints elegíveis falham com erro elegível', async () => {
    const probeFn = vi.fn().mockResolvedValue({ ok: false, failure: 'timeout' } as HealthProbeResult);

    const result = await resolveConnection(mockConfigAuto, { probeFn });

    expect(result.state).toBe('offline');
    expect(result.selectedEndpoint).toBeUndefined();
    expect(result.attempts).toHaveLength(3);
  });

  it('interrompe imediatamente em estado blocked quando ocorre falha não elegível (4xx/configuration)', async () => {
    const probeFn = vi.fn().mockImplementation(async (url: string): Promise<HealthProbeResult> => {
      if (url === MOCK_URLS.local) return { ok: false, failure: 'configuration', statusCode: 403 };
      return { ok: true, statusCode: 200 };
    });

    const result = await resolveConnection(mockConfigAuto, { probeFn });

    expect(result.state).toBe('blocked');
    expect(result.selectedEndpoint).toBeUndefined();
    expect(result.attempts).toHaveLength(1);
    expect(probeFn).toHaveBeenCalledTimes(1); // Não tenta LAN nem Cloud
  });

  it('em modo explícito avalia somente o endpoint configurado', async () => {
    const mockConfigLocal: AppConfig = {
      connectionMode: 'local',
      probeTimeoutMs: 2000,
      endpoints: [{ kind: 'local', url: MOCK_URLS.local, publishableKey: MOCK_KEYS.local }],
    };

    const probeFn = vi.fn().mockResolvedValue({ ok: true, statusCode: 200 } as HealthProbeResult);
    const result = await resolveConnection(mockConfigLocal, { probeFn });

    expect(result.state).toBe('connected');
    expect(result.selectedEndpoint).toBe('local');
    expect(probeFn).toHaveBeenCalledTimes(1);
  });
});
