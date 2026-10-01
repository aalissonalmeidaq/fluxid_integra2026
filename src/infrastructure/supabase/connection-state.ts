/**
 * Modos de conexão aceitos pelo FluxID.
 */
export type ConnectionMode = 'auto' | 'local' | 'lan' | 'cloud';

/**
 * Destinos de infraestrutura Supabase suportados.
 */
export type EndpointKind = 'local' | 'lan' | 'cloud';

/**
 * Configuração de conexão de um endpoint específico.
 */
export interface EndpointConfig {
  kind: EndpointKind;
  url: string;
  publishableKey: string;
  probeTimeoutMs?: number;
  enabled?: boolean;
}

/**
 * Categorias de falha diferenciadas pela arquitetura.
 * Timeout, rede e 5xx autorizam fallback na sondagem;
 * Falhas de autenticação, autorização, isolamento, validação e configuração bloqueiam.
 */
export type FailureKind =
  | 'timeout'
  | 'network'
  | 'service_unavailable'
  | 'authentication'
  | 'authorization'
  | 'validation'
  | 'isolation'
  | 'configuration'
  | 'tenant'
  | 'integrity'
  | 'incompatible_contract'
  | 'cancelled'
  | 'unknown';

/**
 * Estados da máquina de conectividade da fundação.
 */
export type ConnectionState =
  | 'idle'
  | 'probing'
  | 'connected'
  | 'degraded'
  | 'blocked'
  | 'offline';

/**
 * Registro de tentativa de conexão a um endpoint para auditoria e diagnóstico.
 */
export interface ResolutionAttempt {
  endpoint: EndpointKind;
  startedAt: number;
  durationMs: number;
  outcome: 'success' | FailureKind;
  statusCode?: number;
}

/**
 * Resultado completo da resolução de conectividade.
 */
export interface ResolutionResult {
  state: ConnectionState;
  selectedEndpoint?: EndpointKind;
  attempts: ResolutionAttempt[];
}

const ALLOWED_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  idle: ['probing'],
  probing: ['probing', 'connected', 'degraded', 'blocked', 'offline'],
  connected: ['blocked', 'probing'],
  degraded: ['blocked', 'probing'],
  blocked: ['probing'],
  offline: ['probing'],
};

/**
 * Verifica se a transição entre dois estados é permitida.
 */
export function isValidStateTransition(from: ConnectionState, to: ConnectionState): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Executa a transição entre estados ou lança exceção se for inválida.
 */
export function transitionState(from: ConnectionState, to: ConnectionState): ConnectionState {
  if (!isValidStateTransition(from, to)) {
    throw new Error(`Transição de estado inválida: de "${from}" para "${to}".`);
  }
  return to;
}
