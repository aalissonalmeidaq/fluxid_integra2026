import {
  applyArrived, applyChecked, applyDelivered, applyUncheckQueued, applyUnchecked, stopItems, type OfflineTrip,
} from '@/domain/field/offline-trip';
import { dependenciesFor, isOfflineOperation, offlinePermission, type OfflineOperation, type QueuedRef } from '@/domain/field/offline-queue-rules';
import { hasOldPending, type IndicatorInput } from '@/domain/field/sync-status';
import type { OfflineSessionState } from '@/domain/field/offline-session';
import { OfflineOperationPolicy } from '@/infrastructure/synchronization/offline-operation-policy';
import type { OutboxItem, SyncOutbox } from '@/infrastructure/synchronization/sync-outbox';
import type { OfflineTripOwner, OfflineTripStore } from './offline-trip-store';

// A fila offline das operações de campo (Spec 010, RF-001, RF-002, RF-004, RF-005; contracts/fila-local.md §2). Enfileira o PEDIDO, nunca a decisão
// (RN-001): confere permissão, sessão offline, viagem guardada e regras locais, grava na fila numa transação e só então mostra "pendente". Nada é
// marcado como confirmado; quem confirma é o servidor, quando o envio acontece. Posição, recebedor e demais dados sensíveis ficam só no corpo do pedido.
type Raw = Record<string, unknown>;

export type QueueRequest =
  | { operation: 'trip.check_item'; tripId: string; itemId: string; body: Raw }
  | { operation: 'trip.uncheck_item'; tripId: string; itemId: string; body: Raw }
  | { operation: 'trip.arrive_stop'; tripId: string; stopId: string; arrivedAt: string; body: Raw }
  | { operation: 'trip.deliver'; tripId: string; stopId: string; results: { itemId: string; delivered: boolean }[]; body: Raw };

export type RefusalReason = 'forbidden' | 'session_expired' | 'trip_unavailable' | 'item_not_found' | 'stop_not_found' | 'already_done' | 'invalid_state' | 'storage_failed';

export type QueueResult =
  | { kind: 'queued'; itemId: string; requestId: string; counts: ItemCounts }
  // O desfazer de um pedido que ainda não saiu do aparelho: nada foi ao servidor, então nada precisa ser desfeito lá.
  | { kind: 'cancelled'; counts: ItemCounts }
  | { kind: 'refused'; reason: RefusalReason; message: string };

export interface ItemCounts {
  checked: number;
  total: number;
}

export interface OfflineQueueDeps {
  outbox: SyncOutbox;
  store: OfflineTripStore;
  owner: OfflineTripOwner & { deviceId: string };
  now?: () => Date;
  // `trip.operate` do tenant ativo (a mesma permissão das quatro operações).
  canOperate: () => boolean;
  // Teto de 8 horas da sessão offline (RF-016a); a inatividade de 30 minutos não bloqueia.
  session: () => OfflineSessionState;
}

const MESSAGES: Record<RefusalReason, string> = {
  forbidden: 'Você não tem permissão para registrar isto.',
  session_expired: 'Sessão offline expirada. Conecte-se para entrar de novo.',
  trip_unavailable: 'Esta viagem não está disponível offline. Abra-a com conexão.',
  item_not_found: 'Cilindro não encontrado nesta viagem.',
  stop_not_found: 'Parada não encontrada nesta viagem.',
  already_done: 'Isto já foi registrado.',
  invalid_state: 'A situação da viagem não permite esta operação.',
  storage_failed: 'Não foi possível guardar neste aparelho. Libere espaço e tente de novo.',
};
const refuse = (reason: RefusalReason, message?: string): QueueResult => ({ kind: 'refused', reason, message: message ?? MESSAGES[reason] });

// Itens ainda abertos: o que já foi enviado ou descartado não segura ninguém nem conta como pendência.
const OPEN = new Set(['pending', 'syncing', 'conflict', 'failed']);

export function countChecked(trip: OfflineTrip): ItemCounts {
  return {
    checked: trip.items.filter((item) => item.itemStatus === 'checked').length,
    total: trip.items.filter((item) => item.itemStatus === 'planned' || item.itemStatus === 'checked').length,
  };
}

export class OfflineQueueService {
  private readonly now: () => Date;
  private readonly policy = new OfflineOperationPolicy();

  constructor(private readonly deps: OfflineQueueDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async enqueue(request: QueueRequest): Promise<QueueResult> {
    try {
      return await this.run(request);
    } catch {
      // Falha de gravação (espaço, base fechada): a operação **não** aparece como feita.
      return refuse('storage_failed');
    }
  }

  private async run(request: QueueRequest): Promise<QueueResult> {
    this.policy.assertAllowed(request.operation);
    if (!isOfflineOperation(request.operation) || !this.deps.canOperate()) return refuse('forbidden');
    void offlinePermission(request.operation);
    const session = this.deps.session();
    if (!session.allowed) return refuse('session_expired', session.reason);

    const trip = await this.deps.store.get(request.tripId);
    if (!trip) return refuse('trip_unavailable');

    switch (request.operation) {
      case 'trip.check_item': return this.check(trip, request);
      case 'trip.uncheck_item': return this.uncheck(trip, request);
      case 'trip.arrive_stop': return this.arrive(trip, request);
      case 'trip.deliver': return this.deliver(trip, request);
    }
  }

  private async check(trip: OfflineTrip, request: Extract<QueueRequest, { operation: 'trip.check_item' }>): Promise<QueueResult> {
    if (trip.status !== 'loading') return refuse('invalid_state');
    const item = trip.items.find((candidate) => candidate.id === request.itemId);
    if (!item) return refuse('item_not_found');
    if (item.itemStatus !== 'planned') return refuse('already_done', 'Cilindro já estava conferido.');
    return this.record(trip, request, applyChecked(trip, item.id), { itemId: item.id });
  }

  private async uncheck(trip: OfflineTrip, request: Extract<QueueRequest, { operation: 'trip.uncheck_item' }>): Promise<QueueResult> {
    if (trip.status !== 'loading') return refuse('invalid_state');
    const item = trip.items.find((candidate) => candidate.id === request.itemId);
    if (!item) return refuse('item_not_found');
    if (item.itemStatus !== 'checked') return refuse('already_done', 'Este cilindro não está conferido.');
    // Conferência que ainda não saiu do aparelho: basta tirá-la da fila (nenhum evento no servidor).
    const open = await this.openItems();
    const pendingCheck = open.find((entry) => entry.operation === 'trip.check_item' && entry.status === 'pending' && entry.attempt_count === 0
      && entry.payload.item_id === item.id && entry.trip_id === trip.id);
    const hasLaterWork = pendingCheck !== undefined && open.some((entry) => entry.dependencies.includes(pendingCheck.id));
    if (pendingCheck && !hasLaterWork) {
      await this.deps.outbox.cancelPending(pendingCheck.id);
      const next = applyUnchecked(trip, item.id);
      await this.deps.store.update(trip.id, () => next);
      return { kind: 'cancelled', counts: countChecked(next) };
    }
    return this.record(trip, request, applyUncheckQueued(trip, item.id), { itemId: item.id });
  }

  private async arrive(trip: OfflineTrip, request: Extract<QueueRequest, { operation: 'trip.arrive_stop' }>): Promise<QueueResult> {
    if (trip.status !== 'in_progress') return refuse('invalid_state');
    const stop = trip.stops.find((candidate) => candidate.id === request.stopId);
    if (!stop) return refuse('stop_not_found');
    if (stop.status !== 'pending') return refuse('already_done', 'A chegada desta parada já foi registrada.');
    return this.record(trip, request, applyArrived(trip, stop.id, request.arrivedAt), { stopId: stop.id });
  }

  private async deliver(trip: OfflineTrip, request: Extract<QueueRequest, { operation: 'trip.deliver' }>): Promise<QueueResult> {
    if (trip.status !== 'in_progress') return refuse('invalid_state');
    const stop = trip.stops.find((candidate) => candidate.id === request.stopId);
    if (!stop) return refuse('stop_not_found');
    if (stop.status === 'delivered' || stop.status === 'with_divergence') return refuse('already_done', 'A entrega desta parada já foi registrada.');
    if (stop.status !== 'on_site') return refuse('invalid_state', 'Registre a chegada à parada antes da entrega.');
    const known = new Set(stopItems(trip, stop.id).map((item) => item.id));
    if (request.results.some((result) => !known.has(result.itemId))) return refuse('item_not_found');
    return this.record(trip, request, applyDelivered(trip, stop.id, request.results), { stopId: stop.id, itemIds: request.results.map((result) => result.itemId) });
  }

  // Grava o pedido na fila e, só depois, a mudança otimista na cópia da viagem.
  private async record(
    trip: OfflineTrip, request: QueueRequest, next: OfflineTrip, refs: { itemId?: string; stopId?: string; itemIds?: string[] },
  ): Promise<QueueResult> {
    const open = await this.openItems();
    const queue: QueuedRef[] = open.map((entry) => ({
      id: entry.id, operation: entry.operation, tripId: entry.trip_id ?? '', status: entry.status,
      ...(typeof entry.payload.item_id === 'string' ? { itemId: entry.payload.item_id } : {}),
      ...(typeof entry.payload.stop_id === 'string' ? { stopId: entry.payload.stop_id } : {}),
    }));
    const operation = request.operation as OfflineOperation;
    const dependencies = dependenciesFor({
      operation, tripId: trip.id,
      ...(refs.itemId !== undefined ? { itemId: refs.itemId } : {}),
      ...(refs.stopId !== undefined ? { stopId: refs.stopId } : {}),
      ...(refs.itemIds !== undefined ? { itemIds: refs.itemIds } : {}),
    }, queue);
    const item = await this.deps.outbox.enqueue({
      organizationId: this.deps.owner.organizationId, actorId: this.deps.owner.actorId, deviceId: this.deps.owner.deviceId, operation,
      payload: request.body, version: 1, dependencies, endpointId: this.deps.owner.endpointId, tripId: trip.id,
    });
    await this.deps.store.update(trip.id, () => next);
    return { kind: 'queued', itemId: item.id, requestId: item.idempotency_key, counts: countChecked(next) };
  }

  private async openItems(): Promise<OutboxItem[]> {
    return (await this.deps.outbox.listOwned(this.deps.owner)).filter((item) => OPEN.has(item.status));
  }

  async list(): Promise<OutboxItem[]> {
    return (await this.deps.outbox.listOwned(this.deps.owner)).sort((a, b) => a.queued_at.localeCompare(b.queued_at) || a.id.localeCompare(b.id));
  }

  // Números do indicador da barra superior (RF-004). `online` vem de fora (estado de conexão do aplicativo).
  async counts(online: boolean): Promise<IndicatorInput> {
    const open = await this.openItems();
    const now = this.now();
    const pending = open.filter((item) => item.status === 'pending' || item.status === 'failed').length;
    return {
      pending,
      syncing: open.filter((item) => item.status === 'syncing').length,
      conflicts: open.filter((item) => item.status === 'conflict').length,
      total: open.length,
      oldPending: open.filter((item) => (item.status === 'pending' || item.status === 'failed') && hasOldPending(item.queued_at, now)).length,
      online,
    };
  }

  // "Tentar de novo" num item que falhou: volta a pendente com a mesma chave de idempotência, então o envio não duplica.
  async retry(itemId: string): Promise<boolean> {
    const item = (await this.deps.outbox.listOwned(this.deps.owner)).find((entry) => entry.id === itemId);
    if (!item || item.status !== 'failed') return false;
    await this.deps.outbox.resubmit(item.id);
    return true;
  }

  async hasPending(tripId: string): Promise<boolean> {
    return (await this.openItems()).some((item) => item.trip_id === tripId);
  }

  // Cilindros e paradas com mudança ainda na fila: a abertura online da viagem não pode desfazê-la.
  async pendingRefs(tripId: string): Promise<{ itemIds: Set<string>; stopIds: Set<string> }> {
    const itemIds = new Set<string>();
    const stopIds = new Set<string>();
    for (const item of (await this.openItems()).filter((entry) => entry.trip_id === tripId)) {
      if (typeof item.payload.item_id === 'string') itemIds.add(item.payload.item_id);
      if (typeof item.payload.stop_id === 'string') stopIds.add(item.payload.stop_id);
      if (Array.isArray(item.payload.results)) {
        for (const result of item.payload.results as Raw[]) if (typeof result.item_id === 'string') itemIds.add(result.item_id);
      }
    }
    return { itemIds, stopIds };
  }
}
