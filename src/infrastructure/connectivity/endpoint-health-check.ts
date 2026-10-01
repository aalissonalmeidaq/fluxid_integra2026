import type { ConnectionFailure } from './connection-failure-classifier';
import { permitsEndpointFallback } from './connection-failure-classifier';

export type HealthCheckResult =
  | { ok: true; statusCode: number }
  | { ok: false; failure: ConnectionFailure; fallbackAllowed: boolean; statusCode?: number };

interface Options { fetcher?: typeof fetch; signal?: AbortSignal }

export async function checkEndpointHealth(url: string, timeoutMs: number, options: Options = {}): Promise<HealthCheckResult> {
  if (options.signal?.aborted) return { ok: false, failure: 'cancelled', fallbackAllowed: false };
  const controller = new AbortController();
  const onAbort = () => controller.abort('external');
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(`${url.replace(/\/+$/, '')}/auth/v1/health`, { signal: controller.signal });
    if (response.ok) return { ok: true, statusCode: response.status };
    const failure: ConnectionFailure = response.status >= 500 ? 'service_unavailable' : 'configuration';
    return { ok: false, failure, fallbackAllowed: permitsEndpointFallback(failure), statusCode: response.status };
  } catch {
    const externallyCancelled = options.signal?.aborted;
    const timedOut = controller.signal.aborted && !externallyCancelled;
    const failure: ConnectionFailure = externallyCancelled ? 'cancelled' : timedOut ? 'timeout' : 'network';
    return { ok: false, failure, fallbackAllowed: permitsEndpointFallback(failure) };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
