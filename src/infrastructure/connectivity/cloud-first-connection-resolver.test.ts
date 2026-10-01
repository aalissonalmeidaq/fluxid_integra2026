import { describe, expect, it, vi } from 'vitest';
import { resolveCloudFirst } from './cloud-first-connection-resolver';
import type { EndpointConfiguration } from './endpoint-configuration';

const configuration: EndpointConfiguration = {
  mode: 'auto', contractVersion: '002.1', probeTimeoutMs: 3000,
  endpoints: [
    { kind: 'cloud', url: 'https://cloud.test', publishableKey: 'public-cloud' },
    { kind: 'lan', url: 'http://lan.test', publishableKey: 'public-lan' },
    { kind: 'local', url: 'http://local.test', publishableKey: 'public-local' },
  ],
};

describe('CloudFirstConnectionResolver', () => {
  it('encerra ao encontrar cloud saudável e compatível', async () => {
    const inspect = vi.fn().mockResolvedValue({ ok: true });
    const result = await resolveCloudFirst(configuration, { inspect });
    expect(result).toMatchObject({ state: 'connected', selectedEndpoint: 'cloud' });
    expect(inspect).toHaveBeenCalledTimes(1);
  });

  it('avança sequencialmente por falha técnica e bloqueia falha de segurança', async () => {
    const inspect = vi.fn()
      .mockResolvedValueOnce({ ok: false, failure: 'network', fallbackAllowed: true })
      .mockResolvedValueOnce({ ok: false, failure: 'incompatible_contract', fallbackAllowed: false });
    const result = await resolveCloudFirst(configuration, { inspect });
    expect(result.state).toBe('blocked');
    expect(result.attempts.map(({ endpoint }) => endpoint)).toEqual(['cloud', 'lan']);
    expect(inspect).toHaveBeenCalledTimes(2);
  });

  it('seleciona LAN após indisponibilidade da cloud', async () => {
    const inspect = vi.fn()
      .mockResolvedValueOnce({ ok: false, failure: 'network', fallbackAllowed: true })
      .mockResolvedValueOnce({ ok: true });
    await expect(resolveCloudFirst(configuration, { inspect })).resolves.toMatchObject({ state: 'degraded', selectedEndpoint: 'lan' });
  });

  it('faz uma passagem finita, respeita cancelamento e começa novo ciclo pela cloud', async () => {
    const inspect = vi.fn().mockResolvedValue({ ok: false, failure: 'network', fallbackAllowed: true });
    await expect(resolveCloudFirst(configuration, { inspect })).resolves.toMatchObject({ state: 'offline' });
    expect(inspect).toHaveBeenCalledTimes(3);
    inspect.mockClear();
    const controller = new AbortController(); controller.abort();
    await expect(resolveCloudFirst(configuration, { inspect, signal: controller.signal })).resolves.toMatchObject({ state: 'cancelled' });
    expect(inspect).not.toHaveBeenCalled();
    await resolveCloudFirst(configuration, { inspect });
    expect(inspect.mock.calls[0]?.[0]).toMatchObject({ kind: 'cloud' });
  });

  it('seleciona local após cloud e LAN indisponíveis e serializa ciclos concorrentes', async () => {
    let active = 0;
    let maximumActive = 0;
    const inspect = vi.fn(async (endpoint: { kind: string }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return endpoint.kind === 'local'
        ? { ok: true as const }
        : { ok: false as const, failure: 'network' as const, fallbackAllowed: true };
    });
    const [first, second] = await Promise.all([
      resolveCloudFirst(configuration, { inspect }),
      resolveCloudFirst(configuration, { inspect }),
    ]);
    expect(first).toMatchObject({ state: 'degraded', selectedEndpoint: 'local' });
    expect(second).toMatchObject({ state: 'degraded', selectedEndpoint: 'local' });
    expect(maximumActive).toBe(1);
  });
});
