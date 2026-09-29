import {
  type ConnectionMode,
  type EndpointKind,
} from '@/infrastructure/supabase/connection-state';

export type { ConnectionMode, EndpointKind };

/**
 * Representa um endpoint do Supabase já validado e habilitado.
 */
export interface ValidatedEndpoint {
  kind: EndpointKind;
  url: string;
  publishableKey: string;
}

/**
 * Configuração consolidada da aplicação e conectividade.
 */
export interface AppConfig {
  connectionMode: ConnectionMode;
  probeTimeoutMs: number;
  endpoints: ValidatedEndpoint[];
}

/**
 * Detalhe de erro na validação de uma variável de ambiente.
 */
export interface ValidationError {
  variable: string;
  message: string;
}

/**
 * Resultado discriminado da validação das variáveis de ambiente.
 */
export type ValidationResult =
  | { success: true; config: AppConfig }
  | { success: false; errors: ValidationError[] };

const DEFAULT_TIMEOUT_MS = 2000;
const MIN_TIMEOUT_MS = 250;
const MAX_TIMEOUT_MS = 10000;

/**
 * Valida um dicionário de variáveis de ambiente contra o contrato de conectividade.
 * Garante que chaves parciais sejam reprovadas e que nenhum valor confidencial
 * seja propagado nas mensagens de erro.
 */
export function validateEnvironment(env: Record<string, string | undefined>): ValidationResult {
  const errors: ValidationError[] = [];

  const rawMode = env.VITE_SUPABASE_CONNECTION_MODE;
  if (!rawMode || !['auto', 'local', 'lan', 'cloud'].includes(rawMode)) {
    errors.push({
      variable: 'VITE_SUPABASE_CONNECTION_MODE',
      message: 'Modo de conexão deve ser "auto", "local", "lan" ou "cloud"',
    });
  }

  let probeTimeoutMs = DEFAULT_TIMEOUT_MS;
  const rawTimeout = env.VITE_SUPABASE_PROBE_TIMEOUT_MS;
  if (rawTimeout !== undefined && rawTimeout !== '') {
    const parsed = Number(rawTimeout);
    if (!Number.isInteger(parsed) || parsed < MIN_TIMEOUT_MS || parsed > MAX_TIMEOUT_MS) {
      errors.push({
        variable: 'VITE_SUPABASE_PROBE_TIMEOUT_MS',
        message: `Timeout do probe deve ser um número inteiro entre ${MIN_TIMEOUT_MS} e ${MAX_TIMEOUT_MS} ms`,
      });
    } else {
      probeTimeoutMs = parsed;
    }
  }

  const endpointPairs: Array<{
    kind: EndpointKind;
    urlVar: string;
    keyVar: string;
  }> = [
    { kind: 'local', urlVar: 'VITE_SUPABASE_LOCAL_URL', keyVar: 'VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY' },
    { kind: 'lan', urlVar: 'VITE_SUPABASE_LAN_URL', keyVar: 'VITE_SUPABASE_LAN_PUBLISHABLE_KEY' },
    { kind: 'cloud', urlVar: 'VITE_SUPABASE_CLOUD_URL', keyVar: 'VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY' },
  ];

  const endpoints: ValidatedEndpoint[] = [];

  for (const { kind, urlVar, keyVar } of endpointPairs) {
    const url = env[urlVar]?.trim();
    const key = env[keyVar]?.trim();

    if (url && !key) {
      errors.push({
        variable: keyVar,
        message: `Chave publicável obrigatória para o endpoint ${kind}`,
      });
    } else if (!url && key) {
      errors.push({
        variable: urlVar,
        message: `URL obrigatória para o endpoint ${kind}`,
      });
    } else if (url && key) {
      endpoints.push({ kind, url, publishableKey: key });
    }
  }

  const mode = rawMode as ConnectionMode;

  if (mode && mode !== 'auto') {
    const hasRequired = endpoints.some((e) => e.kind === mode);
    if (!hasRequired) {
      const pair = endpointPairs.find((p) => p.kind === mode);
      if (pair && !errors.some((e) => e.variable === pair.urlVar || e.variable === pair.keyVar)) {
        errors.push({
          variable: pair.urlVar,
          message: `Endpoint obrigatório para o modo ${mode}`,
        });
      }
    }
  } else if (mode === 'auto') {
    if (endpoints.length === 0 && errors.length === 0) {
      errors.push({
        variable: 'VITE_SUPABASE_CONNECTION_MODE',
        message: 'Modo auto exige pelo menos um endpoint configurado com par URL/chave completo',
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // Ordena por prioridade: local < lan < cloud
  const priorityOrder: Record<EndpointKind, number> = { local: 1, lan: 2, cloud: 3 };
  endpoints.sort((a, b) => priorityOrder[a.kind] - priorityOrder[b.kind]);

  return {
    success: true,
    config: {
      connectionMode: mode,
      probeTimeoutMs,
      endpoints: mode === 'auto' ? endpoints : endpoints.filter((e) => e.kind === mode),
    },
  };
}
