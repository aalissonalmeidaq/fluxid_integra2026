import { FailureKind } from './connection-state';

export interface ProbeFailureOptions {
  timeout?: boolean;
  networkError?: boolean;
  statusCode?: number;
}

export interface OperationalErrorMetadata {
  statusCode?: number;
  code?: string;
  networkError?: boolean;
  context?: 'auth' | 'data' | 'network' | 'unknown';
}

/**
 * Classifica o resultado de um probe de disponibilidade em categorias arquiteturais.
 */
export function classifyProbeFailure(options: ProbeFailureOptions): FailureKind {
  if (options.timeout) {
    return 'timeout';
  }

  if (options.networkError) {
    return 'network';
  }

  const status = options.statusCode;
  if (status !== undefined) {
    if (status >= 500) {
      return 'service_unavailable';
    }
    if (status >= 400 && status < 500) {
      return 'configuration';
    }
  }

  return 'unknown';
}

/**
 * Classifica um erro operacional recebido após o cliente estar conectado.
 * Usa apenas metadados sanitizados (status HTTP, código SQL ou de serviço).
 */
export function classifyOperationalError(meta: OperationalErrorMetadata): FailureKind {
  const { statusCode, code } = meta;

  if (meta.networkError) {
    return 'network';
  }

  if (statusCode !== undefined && statusCode >= 500) {
    return 'service_unavailable';
  }

  // Erros de autenticação (credencial, sessão inválida ou expirada)
  if (statusCode === 401 || code === 'PGRST301' || code === 'invalid_jwt') {
    return 'authentication';
  }

  // Erros de autorização (permissão no Postgres, RBAC)
  if (statusCode === 403 || code === '42501') {
    return 'authorization';
  }

  // PGRST116 indica uma consulta singular sem resultado único; não prova violação de RLS.
  if (code === 'PGRST116') {
    return 'validation';
  }

  // Erros de isolamento e RLS explicitamente identificados.
  if (code === 'rls_violation') {
    return 'isolation';
  }

  // Erros de validação (regras de chave estrangeira, not null, schema)
  if (statusCode === 422 || code === '23502' || code === '23505' || code === '23503') {
    return 'validation';
  }

  // Erro de configuração de requisição
  if (statusCode === 400 || statusCode === 404) {
    return 'configuration';
  }

  return 'unknown';
}

/**
 * Determina se a falha permite fallback para o próximo endpoint elegível.
 * Apenas falhas comprovadas de transporte/infraestrutura permitem fallback;
 * falhas de autenticação, autorização, RLS, validação e configuração bloqueiam.
 */
export function isFallbackAllowed(failure: FailureKind): boolean {
  return failure === 'timeout' || failure === 'network' || failure === 'service_unavailable';
}
