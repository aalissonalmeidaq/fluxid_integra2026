import { validateEnvironment, type ConnectionMode, type ValidatedEndpoint } from '@/config/environment';

export interface EndpointConfiguration {
  mode: ConnectionMode;
  contractVersion: string;
  probeTimeoutMs: number;
  endpoints: ValidatedEndpoint[];
}

export type EndpointConfigurationResult =
  | { ok: true; value: EndpointConfiguration }
  | { ok: false; errors: Array<{ variable: string; message: string }> };

export function createEndpointConfiguration(env: Record<string, string | undefined>): EndpointConfigurationResult {
  const result = validateEnvironment(env);
  if (!result.success) return { ok: false, errors: result.errors };
  return {
    ok: true,
    value: {
      mode: result.config.connectionMode,
      contractVersion: result.config.contractVersion,
      probeTimeoutMs: result.config.probeTimeoutMs,
      endpoints: result.config.endpoints,
    },
  };
}
