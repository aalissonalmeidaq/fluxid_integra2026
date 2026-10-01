import type { ConnectionFailure } from './connection-failure-classifier';

export type CompatibilityResult =
  | { ok: true; contractVersion: string }
  | { ok: false; failure: ConnectionFailure; fallbackAllowed: false };

interface Options { fetcher?: typeof fetch; signal?: AbortSignal }

export async function checkEndpointCompatibility(url: string, expectedVersion: string, options: Options = {}): Promise<CompatibilityResult> {
  try {
    const response = await (options.fetcher ?? fetch)(`${url.replace(/\/+$/, '')}/functions/v1/public-compatibility`, { signal: options.signal });
    if (!response.ok) return { ok: false, failure: 'configuration', fallbackAllowed: false };
    const body: unknown = await response.json();
    const version = typeof body === 'object' && body !== null && 'contractVersion' in body ? (body as { contractVersion?: unknown }).contractVersion : undefined;
    if (version !== expectedVersion) return { ok: false, failure: 'incompatible_contract', fallbackAllowed: false };
    return { ok: true, contractVersion: expectedVersion };
  } catch {
    return { ok: false, failure: 'configuration', fallbackAllowed: false };
  }
}
