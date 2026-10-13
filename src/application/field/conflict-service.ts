import { conflictReasonText } from '@/domain/field/sync-status';
import { revertOptimistic, settlePending } from '@/domain/field/offline-trip';
import { ConflictResolver, type ConflictRecord, type FieldConflictSummary } from '@/infrastructure/synchronization/conflict-resolver';
import type { ExecutorTransport } from '@/infrastructure/synchronization/operation-executors';
import type { OutboxItem, SyncOutbox } from '@/infrastructure/synchronization/sync-outbox';
import { summarizeConflict } from './conflict-summary';
import type { OfflineTripStore } from './offline-trip-store';

// Decisão sobre os conflitos das operações de campo (Spec 010, RF-013, RF-026, RN-002). Só quem está com o aparelho de origem decide, com `trip.operate`.
// **O servidor decide primeiro**: descartar e reenviar chamam `resolve_sync_conflict` (que registra a decisão, a justificativa e a auditoria) e só depois
// o item muda ou sai do aparelho. Nada é descartado sem decisão registrada, nem por tempo, sessão ou limite.
export type DecisionFailure = 'offline' | 'forbidden' | 'invalid_justification' | 'not_found' | 'already_resolved' | 'session_expired' | 'unavailable';
export type DecisionResult = { ok: true } | { ok: false; reason: DecisionFailure };

export interface ConflictView {
  conflictId: string;
  itemId: string;
  tripId: string;
  reasonCode: string;
  reasonText: string;
  // O que a pessoa fez, sem dado sensível.
  summary: FieldConflictSummary;
  // Estado atual do servidor (de, para, entidade), sem dado sensível.
  remote: Record<string, unknown>;
  createdAt: string;
}

export interface ConflictServiceDeps {
  outbox: SyncOutbox;
  resolver: ConflictResolver;
  store: OfflineTripStore;
  transport: ExecutorTransport;
  organizationId: string;
  // Só a fila desta conta e deste destino (RF-016).
  owner: { actorId: string; endpointId: string };
  actorId: string;
  canOperate: () => boolean;
  isOnline: () => boolean;
  newRequestId?: () => string;
  // Depois de um descarte confirmado: o que dependia da entrega descartada (fotos e assinatura) sai junto do aparelho.
  onDiscarded?: (item: OutboxItem) => Promise<void>;
}

const MIN_JUSTIFICATION = 5;
const MAX_JUSTIFICATION = 500;

export class ConflictService {
  private readonly newRequestId: () => string;

  constructor(private readonly deps: ConflictServiceDeps) {
    this.newRequestId = deps.newRequestId ?? (() => crypto.randomUUID());
  }

  // Conflitos abertos desta conta e deste destino, com o item da fila a que pertencem.
  async list(): Promise<ConflictView[]> {
    const items = new Map((await this.deps.outbox.listOwned(this.deps.owner)).map((item) => [item.id, item]));
    const views: ConflictView[] = [];
    for (const conflict of await this.deps.resolver.list()) {
      if (conflict.status !== 'open' || conflict.entity !== 'trip') continue;
      const item = items.get(conflict.outbox_item_id);
      if (!item) continue;
      const code = item.failure_reason ?? 'VALIDATION_FAILED';
      views.push({
        conflictId: conflict.id, itemId: item.id, tripId: conflict.entity_id, reasonCode: code, reasonText: conflictReasonText(code),
        summary: (conflict.local_version.data ?? { operation: item.operation, queuedAt: item.queued_at }) as unknown as FieldConflictSummary,
        remote: conflict.remote_version.data ?? {}, createdAt: conflict.created_at,
      });
    }
    return views.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async discard(conflictId: string, justification: string): Promise<DecisionResult> {
    const text = justification.replace(/\s+/g, ' ').trim();
    const gate = this.gate();
    if (gate) return gate;
    if (text.length < MIN_JUSTIFICATION || text.length > MAX_JUSTIFICATION) return { ok: false, reason: 'invalid_justification' };
    const found = await this.find(conflictId);
    if (!found) return { ok: false, reason: 'not_found' };
    const outcome = await this.call(found.item, 'discard', text);
    // O servidor já tinha o descarte (a resposta se perdeu antes): vale como feito, e o aparelho se limpa.
    if (outcome !== 'ok' && outcome !== 'already_resolved') return { ok: false, reason: outcome };
    await this.removeDiscarded(found.conflict, found.item);
    return { ok: true };
  }

  async resubmit(conflictId: string): Promise<DecisionResult> {
    const gate = this.gate();
    if (gate) return gate;
    const found = await this.find(conflictId);
    if (!found) return { ok: false, reason: 'not_found' };
    const outcome = await this.call(found.item, 'resubmit', null);
    if (outcome === 'already_resolved') {
      // O servidor já tem o descarte: é a decisão que vale, e o aparelho a acompanha.
      await this.removeDiscarded(found.conflict, found.item);
      return { ok: false, reason: 'already_resolved' };
    }
    if (outcome !== 'ok') return { ok: false, reason: outcome };
    await this.deps.outbox.resubmit(found.item.id);
    await this.deps.resolver.closeFieldConflict(found.conflict.id, 'keep_local');
    return { ok: true };
  }

  private gate(): DecisionResult | null {
    if (!this.deps.canOperate()) return { ok: false, reason: 'forbidden' };
    // Sem conexão a decisão não é auditada no servidor: nada é descartado nem reenviado.
    if (!this.deps.isOnline()) return { ok: false, reason: 'offline' };
    return null;
  }

  private async find(conflictId: string): Promise<{ conflict: ConflictRecord; item: OutboxItem } | null> {
    const conflict = (await this.deps.resolver.list()).find((entry) => entry.id === conflictId && entry.status === 'open' && entry.entity === 'trip');
    if (!conflict) return null;
    const item = (await this.deps.outbox.listOwned(this.deps.owner)).find((entry) => entry.id === conflict.outbox_item_id);
    return item ? { conflict, item } : null;
  }

  private async call(item: OutboxItem, decision: 'discard' | 'resubmit', justification: string | null): Promise<'ok' | 'already_resolved' | DecisionFailure> {
    let response: { status: number; body: unknown };
    try {
      response = await this.deps.transport.call('manage-trips', {
        operation: 'resolve_sync_conflict', organization_id: this.deps.organizationId, request_id: this.newRequestId(), trip_id: item.trip_id, source_request_id: item.idempotency_key,
        decision, ...(justification !== null ? { justification } : {}),
      });
    } catch {
      return 'unavailable';
    }
    const code = response.body !== null && typeof response.body === 'object' ? (response.body as { code?: unknown }).code : undefined;
    if (response.status >= 200 && response.status < 300) return 'ok';
    if (response.status === 401) return 'session_expired';
    if (response.status === 403) return 'forbidden';
    if (response.status === 404) return 'not_found';
    if (response.status === 409 && code === 'ALREADY_RESOLVED') return 'already_resolved';
    if (response.status === 400) return 'invalid_justification';
    return 'unavailable';
  }

  // Descarte confirmado pelo servidor: o item sai do aparelho por inteiro, a cópia da viagem volta ao que o servidor conhece e os dependentes viram conflito.
  private async removeDiscarded(conflict: ConflictRecord, item: OutboxItem): Promise<void> {
    const payload = item.payload;
    const tripId = item.trip_id ?? conflict.entity_id;
    const itemIds = Array.isArray(payload.results) ? (payload.results as { item_id?: unknown }[]).flatMap((entry) => (typeof entry.item_id === 'string' ? [entry.item_id] : [])) : [];
    await this.deps.outbox.discardAndRemove(item.id, { authorized: true, actorId: this.deps.actorId });
    await this.deps.onDiscarded?.(item);
    await this.deps.resolver.closeFieldConflict(conflict.id, 'discard_local');

    const dependents = (await this.deps.outbox.listOwned(this.deps.owner)).filter((entry) => entry.dependencies.includes(item.id) && entry.status === 'pending');
    for (const dependent of dependents) {
      await this.deps.outbox.transition(dependent.id, 'syncing');
      await this.deps.outbox.transition(dependent.id, 'conflict', { failureReason: 'MISSING_DEPENDENCY' });
      const trip = await this.deps.store.get(dependent.trip_id ?? tripId);
      await this.deps.resolver.registerFieldConflict({
        organizationId: dependent.organization_id, outboxItemId: dependent.id, tripId: dependent.trip_id ?? tripId, reasonCode: 'MISSING_DEPENDENCY',
        summary: summarizeConflict(dependent, trip), remote: {},
      });
    }

    await this.deps.store.update(tripId, (trip) => revertOptimistic(trip, item.operation, {
      ...(typeof payload.item_id === 'string' ? { itemId: payload.item_id } : {}), ...(typeof payload.stop_id === 'string' ? { stopId: payload.stop_id } : {}), itemIds,
    }));
    const remaining = new Set<string>();
    const remainingStops = new Set<string>();
    for (const entry of (await this.deps.outbox.listOwned(this.deps.owner)).filter((candidate) => candidate.trip_id === tripId && candidate.status !== 'synced')) {
      if (typeof entry.payload.item_id === 'string') remaining.add(entry.payload.item_id);
      if (typeof entry.payload.stop_id === 'string') remainingStops.add(entry.payload.stop_id);
      if (Array.isArray(entry.payload.results)) for (const result of entry.payload.results as { item_id?: unknown }[]) if (typeof result.item_id === 'string') remaining.add(result.item_id);
    }
    await this.deps.store.update(tripId, (trip) => settlePending(trip, { itemIds: remaining, stopIds: remainingStops }));
  }
}
