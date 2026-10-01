import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkEndpointHealth } from './endpoint-health-check';

afterEach(() => vi.restoreAllMocks());

describe('EndpointHealthCheck', () => {
  it('aceita 2xx e classifica 5xx como fallback elegível', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(checkEndpointHealth('https://example.test', 3000, { fetcher })).resolves.toMatchObject({ ok: true });
    await expect(checkEndpointHealth('https://example.test', 3000, { fetcher })).resolves.toEqual({ ok: false, failure: 'service_unavailable', fallbackAllowed: true, statusCode: 503 });
  });

  it('classifica rede e respeita cancelamento externo', async () => {
    const network = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(checkEndpointHealth('https://example.test', 3000, { fetcher: network })).resolves.toMatchObject({ failure: 'network', fallbackAllowed: true });

    const controller = new AbortController();
    controller.abort();
    await expect(checkEndpointHealth('https://example.test', 3000, { signal: controller.signal })).resolves.toMatchObject({ failure: 'cancelled', fallbackAllowed: false });
  });

  it('classifica recusa HTTP como bloqueante e timeout como fallback elegível', async () => {
    const refused = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(checkEndpointHealth('https://example.test', 3000, { fetcher: refused })).resolves.toMatchObject({ failure: 'configuration', fallbackAllowed: false });

    const pending = vi.fn((_input: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    await expect(checkEndpointHealth('https://example.test', 1, { fetcher: pending as unknown as typeof fetch })).resolves.toMatchObject({ failure: 'timeout', fallbackAllowed: true });
  });
});
