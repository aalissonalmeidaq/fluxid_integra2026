// Regras da fila offline do aplicativo de campo (Spec 010, RF-001, RF-003, RF-010, RF-012, RF-014). Puras: nada de navegador, banco local nem rede.
// A fila guarda pedidos, não decisões (RN-001): quem muda a situação da viagem e do cilindro é o servidor.

// As quatro operações que entram na fila (política offline da Spec 002 preenchida por esta spec). Os anexos seguem por envio próprio.
export const OFFLINE_OPERATIONS = ['trip.check_item', 'trip.uncheck_item', 'trip.arrive_stop', 'trip.deliver'] as const;
export type OfflineOperation = (typeof OFFLINE_OPERATIONS)[number];

export function isOfflineOperation(operation: string): operation is OfflineOperation {
  return (OFFLINE_OPERATIONS as readonly string[]).includes(operation);
}

// A permissão da Spec 008 para enfileirar qualquer das quatro operações é `trip.operate` (conferir, chegar e entregar; `trip.deliver` é só o nome da
// operação na auditoria, não uma permissão). Conferida na tela e de novo no servidor ao enviar.
export function offlinePermission(_operation: OfflineOperation): 'trip.operate' {
  return 'trip.operate';
}

// Ações que dependem de revalidação do servidor (teste hidrostático, CNH, veículo, segundo fator) e nunca entram na fila.
const CONNECTION_REQUIRED = new Set([
  'plan_trip', 'update_trip', 'start_loading', 'revert_loading', 'start_trip', 'cancel_trip', 'complete_trip', 'unlock_item', 'return_item', 'correct_delivery',
  'query_cylinders',
]);
export const CONNECTION_REQUIRED_REASON = 'Exige conexão';

export function connectionRequired(action: string): boolean {
  return CONNECTION_REQUIRED.has(action);
}

// Horário informado de origem offline: até 7 dias antes do recebimento (RF-014); o servidor repete a regra.
export const STALE_OPERATION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isStaleOperation(informedAt: Date, now: Date): boolean {
  return informedAt.getTime() < now.getTime() - STALE_OPERATION_DAYS * DAY_MS;
}

// Item da fila visto só pelo que importa às dependências.
export interface QueuedRef {
  id: string;
  operation: OfflineOperation | string;
  tripId: string;
  status: string;
  itemId?: string;
  stopId?: string;
}

export interface NewOperation {
  operation: OfflineOperation;
  tripId: string;
  // Conferir e desfazer: o item da viagem. Entrega: os itens da parada. Chegada e entrega: a parada.
  itemId?: string;
  itemIds?: string[];
  stopId?: string;
}

// Itens que ainda podem bloquear os seguintes: o que já foi enviado ou descartado não segura ninguém.
const OPEN = new Set(['pending', 'syncing', 'conflict', 'failed']);

// Dependências **lógicas** (RF-010 e RF-012): a operação anterior sobre o mesmo cilindro; a chegada da mesma parada, para a entrega; e a
// conferência ainda aberta dos cilindros da parada. Um conflito bloqueia só quem depende dele, nunca a viagem inteira.
export function dependenciesFor(next: NewOperation, queue: readonly QueuedRef[]): string[] {
  const open = queue.filter((item) => item.tripId === next.tripId && OPEN.has(item.status));
  const found = new Set<string>();
  const isItemOperation = (item: QueuedRef) => item.operation === 'trip.check_item' || item.operation === 'trip.uncheck_item';
  if (next.operation === 'trip.check_item' || next.operation === 'trip.uncheck_item') {
    for (const item of open) if (isItemOperation(item) && next.itemId !== undefined && item.itemId === next.itemId) found.add(item.id);
  }
  if (next.operation === 'trip.deliver') {
    const itemIds = new Set(next.itemIds ?? []);
    for (const item of open) {
      if (item.operation === 'trip.arrive_stop' && next.stopId !== undefined && item.stopId === next.stopId) found.add(item.id);
      if (isItemOperation(item) && item.itemId !== undefined && itemIds.has(item.itemId)) found.add(item.id);
    }
  }
  return [...found];
}
