import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeEndpointHealth, HealthProbeResult } from './endpoint-health';
import { createHealthResponse, createNetworkError, createTimeoutError } from '@/test/fixtures/connectivity';

describe('Sondagem de Endpoint (Endpoint Health Probe)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna sucesso quando o endpoint responde com status 200', async () => {
    global.fetch = vi.fn().mockResolvedValue(createHealthResponse(200));

    const result: HealthProbeResult = await probeEndpointHealth('http://127.0.0.1:54321', 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.statusCode).toBe(200);
    }
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/auth/v1/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('retorna service_unavailable quando responde 500 ou 503', async () => {
    global.fetch = vi.fn().mockResolvedValue(createHealthResponse(503));

    const result = await probeEndpointHealth('http://127.0.0.1:54321', 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('service_unavailable');
      expect(result.statusCode).toBe(503);
    }
  });

  it('retorna configuration em erro 4xx no probe', async () => {
    global.fetch = vi.fn().mockResolvedValue(createHealthResponse(404));

    const result = await probeEndpointHealth('http://127.0.0.1:54321', 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('configuration');
      expect(result.statusCode).toBe(404);
    }
  });

  it('retorna timeout quando a requisição é abortada por limite de tempo', async () => {
    global.fetch = vi.fn().mockRejectedValue(createTimeoutError());

    const result = await probeEndpointHealth('http://127.0.0.1:54321', 500);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('timeout');
    }
  });

  it('retorna network quando ocorre erro de rede/transporte', async () => {
    global.fetch = vi.fn().mockRejectedValue(createNetworkError());

    const result = await probeEndpointHealth('http://127.0.0.1:54321', 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('network');
    }
  });

  it('retorna unknown quando responde status fora de 2xx, 4xx ou 5xx', async () => {
    global.fetch = vi.fn().mockResolvedValue(createHealthResponse(302));

    const result = await probeEndpointHealth('http://127.0.0.1:54321', 1000);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('unknown');
      expect(result.statusCode).toBe(302);
    }
  });
});
