import { FailureKind } from './connection-state';

export interface HealthProbeSuccess {
  ok: true;
  statusCode: number;
}

export interface HealthProbeFailure {
  ok: false;
  failure: FailureKind;
  statusCode?: number;
}

export type HealthProbeResult = HealthProbeSuccess | HealthProbeFailure;

export async function probeEndpointHealth(
  rawUrl: string,
  timeoutMs: number
): Promise<HealthProbeResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const cleanUrl = rawUrl.replace(/\/+$/, '');
  const probeUrl = `${cleanUrl}/auth/v1/health`;

  try {
    const response = await fetch(probeUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    // Descarta o corpo da resposta imediatamente sem armazenar
    if (response.body) {
      try {
        await response.body.cancel();
      } catch {
        // Ignora erro de descarte
      }
    }

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, statusCode: response.status };
    }

    if (response.status >= 500) {
      return { ok: false, failure: 'service_unavailable', statusCode: response.status };
    }

    if (response.status >= 400 && response.status < 500) {
      return { ok: false, failure: 'configuration', statusCode: response.status };
    }

    return { ok: false, failure: 'unknown', statusCode: response.status };
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof DOMException && error.name === 'TimeoutError') ||
      (error instanceof Error && error.name === 'TimeoutError') ||
      (error instanceof Error && error.message.toLowerCase().includes('aborted'))
    ) {
      return { ok: false, failure: 'timeout' };
    }

    return { ok: false, failure: 'network' };
  }
}
