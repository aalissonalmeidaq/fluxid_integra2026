import { AppConfig } from '@/config/environment';
import {
  ResolutionResult,
  ResolutionAttempt,
} from './connection-state';
import { probeEndpointHealth, HealthProbeResult } from './endpoint-health';
import { isFallbackAllowed } from './failure-classifier';

export interface ResolveOptions {
  probeFn?: (url: string, timeoutMs: number) => Promise<HealthProbeResult>;
  nowFn?: () => number;
}

export { isFallbackAllowed as isFallbackEligible };

/**
 * Resolve sequencialmente a conexão Supabase seguindo as prioridades definidas:
 * Em modo explícito: apenas o endpoint selecionado.
 * Em modo auto: local -> lan -> cloud.
 * Falhas não elegíveis (4xx, configuração) bloqueiam imediatamente.
 */
export async function resolveConnection(
  config: AppConfig,
  options?: ResolveOptions
): Promise<ResolutionResult> {
  const probe = options?.probeFn ?? probeEndpointHealth;
  const now = options?.nowFn ?? (() => Date.now());

  const attempts: ResolutionAttempt[] = [];
  let fallbackOccurred = false;

  for (const endpoint of config.endpoints) {
    const startedAt = now();
    const probeResult = await probe(endpoint.url, config.probeTimeoutMs);
    const durationMs = Math.max(0, now() - startedAt);

    if (probeResult.ok) {
      attempts.push({
        endpoint: endpoint.kind,
        startedAt,
        durationMs,
        outcome: 'success',
        statusCode: probeResult.statusCode,
      });

      return {
        state: fallbackOccurred ? 'degraded' : 'connected',
        selectedEndpoint: endpoint.kind,
        attempts,
      };
    }

    const failure = probeResult.failure;
    attempts.push({
      endpoint: endpoint.kind,
      startedAt,
      durationMs,
      outcome: failure,
      statusCode: probeResult.statusCode,
    });

    if (!isFallbackAllowed(failure)) {
      // Falha bloqueante (4xx, erro de autenticação/configuração): não tenta próximos endpoints
      return {
        state: 'blocked',
        attempts,
      };
    }

    fallbackOccurred = true;
  }

  // Todos os endpoints configurados foram testados e falharam por indisponibilidade elegível
  return {
    state: 'offline',
    attempts,
  };
}
