import type { EndpointConfiguration } from './endpoint-configuration';
import type { ConnectionFailure } from './connection-failure-classifier';
import { checkEndpointHealth } from './endpoint-health-check';
import { checkEndpointCompatibility } from './endpoint-compatibility-check';

type Inspection = { ok: true } | { ok: false; failure: ConnectionFailure; fallbackAllowed: boolean };
interface Options { inspect?: (endpoint: EndpointConfiguration['endpoints'][number], signal?: AbortSignal) => Promise<Inspection>; signal?: AbortSignal }
interface Attempt { endpoint: EndpointConfiguration['endpoints'][number]['kind']; outcome: 'success' | ConnectionFailure }

async function inspectDefault(endpoint: EndpointConfiguration['endpoints'][number], config: EndpointConfiguration, signal?: AbortSignal): Promise<Inspection> {
  const health = await checkEndpointHealth(endpoint.url, config.probeTimeoutMs, { signal });
  if (!health.ok) return health;
  return checkEndpointCompatibility(endpoint.url, config.contractVersion, { signal });
}

let resolutionTail: Promise<void> = Promise.resolve();

async function resolveCycle(config: EndpointConfiguration, options: Options = {}) {
  const attempts: Attempt[] = [];
  if (options.signal?.aborted) return { state: 'cancelled' as const, attempts };
  for (const endpoint of config.endpoints) {
    if (options.signal?.aborted) return { state: 'cancelled' as const, attempts };
    const result = await (options.inspect ? options.inspect(endpoint, options.signal) : inspectDefault(endpoint, config, options.signal));
    attempts.push({ endpoint: endpoint.kind, outcome: result.ok ? 'success' : result.failure });
    if (result.ok) return { state: endpoint.kind === 'cloud' ? 'connected' as const : 'degraded' as const, selectedEndpoint: endpoint.kind, attempts };
    if (!result.fallbackAllowed) return { state: 'blocked' as const, attempts };
  }
  return { state: 'offline' as const, attempts };
}

export function resolveCloudFirst(config: EndpointConfiguration, options: Options = {}) {
  const previous = resolutionTail;
  let release!: () => void;
  resolutionTail = new Promise<void>((resolve) => { release = resolve; });
  return previous.then(() => resolveCycle(config, options)).finally(release);
}
