import type { OfflineOperation } from '@/domain/field/offline-queue-rules';
import type { OutboxItem } from './sync-outbox';

// Executores por operação da fila (Spec 010, RF-009, RF-011, RF-012; research.md §2): cada item da outbox vira a chamada certa de `manage-trips`, com o
// `request_id` igual à chave de idempotência (o servidor devolve o mesmo resultado se o pedido repetir) e a hora da fila. A resposta decide o estado do
// item. Nada sensível sai daqui: o resultado nunca repete o corpo da resposta nem a mensagem do erro.
export interface ExecutorTransport {
  call(fn: 'manage-trips', body: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
}

export type ExecutorOutcome =
  // Confirmado pelo servidor (aplicado ou repetido): o item sai do aparelho por inteiro.
  | { kind: 'synced'; serverTimestamp: string; result: Record<string, unknown> }
  // Recusado por regra de domínio: o item vira conflito, preservado, e uma pessoa decide.
  | { kind: 'conflict'; reasonCode: string; remote: Record<string, string> }
  // Sem sessão ou sem permissão: interrompe o envio e pede nova entrada; a fila fica como está.
  | { kind: 'interrupt'; reason: 'auth_error' | 'forbidden' }
  // Falha de rede ou do servidor: volta a pendente, com espera crescente.
  | { kind: 'retry'; reason: 'network' | 'server' };

export type Executor = (item: OutboxItem) => Promise<ExecutorOutcome>;

export const MANAGE_OPERATION_OF: Record<OfflineOperation, string> = {
  'trip.check_item': 'check_item',
  'trip.uncheck_item': 'uncheck_item',
  'trip.arrive_stop': 'arrive_stop',
  'trip.deliver': 'register_delivery',
};

const REASON_CODE = /^[A-Z][A-Z0-9_]{0,59}$/;
const GENERIC_REASON = 'VALIDATION_FAILED';
// Só estes campos da resposta de recusa descrevem o estado atual do servidor sem dado sensível.
const SAFE_REMOTE_KEYS = ['from', 'to', 'entity'] as const;

function conflictOf(body: unknown): Extract<ExecutorOutcome, { kind: 'conflict' }> {
  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof record.code === 'string' && REASON_CODE.test(record.code) ? record.code : GENERIC_REASON;
  const remote: Record<string, string> = {};
  for (const key of SAFE_REMOTE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.length <= 40 && /^[a-z_]+$/.test(value)) remote[key] = value;
  }
  return { kind: 'conflict', reasonCode: code, remote };
}

export interface ExecutorOptions {
  now?: () => Date;
}

export function createTripExecutors(transport: ExecutorTransport, options: ExecutorOptions = {}): Record<OfflineOperation, Executor> {
  const now = options.now ?? (() => new Date());
  const executorFor = (operation: OfflineOperation): Executor => async (item) => {
    // Os campos do envio vêm depois do payload: o corpo guardado nunca os sobrescreve.
    const body = {
      ...item.payload,
      operation: MANAGE_OPERATION_OF[operation],
      organization_id: item.organization_id,
      request_id: item.idempotency_key,
      queued_at: item.queued_at,
    };
    let response: { status: number; body: unknown };
    try {
      response = await transport.call('manage-trips', body);
    } catch {
      return { kind: 'retry', reason: 'network' };
    }
    if (response.status >= 200 && response.status < 300) {
      const result = response.body !== null && typeof response.body === 'object' ? (response.body as Record<string, unknown>) : {};
      return { kind: 'synced', serverTimestamp: now().toISOString(), result };
    }
    if (response.status === 401) return { kind: 'interrupt', reason: 'auth_error' };
    if (response.status === 403) return { kind: 'interrupt', reason: 'forbidden' };
    if (response.status === 400 || response.status === 404 || response.status === 409 || response.status === 422) return conflictOf(response.body);
    return { kind: 'retry', reason: 'server' };
  };
  return {
    'trip.check_item': executorFor('trip.check_item'),
    'trip.uncheck_item': executorFor('trip.uncheck_item'),
    'trip.arrive_stop': executorFor('trip.arrive_stop'),
    'trip.deliver': executorFor('trip.deliver'),
  };
}
