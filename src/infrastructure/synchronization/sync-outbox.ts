import { LocalDatabase, type LocalRecord, type RecordOwner } from '@/infrastructure/local-database/local-database';

export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed' | 'discarded';

export interface OutboxItem extends LocalRecord {
  id: string;
  idempotency_key: string;
  organization_id: string;
  actor_id: string;
  device_id: string;
  operation: string;
  payload: Record<string, unknown>;
  version: number;
  dependencies: string[];
  local_timestamp: string;
  // Spec 010: o destino Supabase de origem (a fila nunca vai a outro), a viagem (para a ordem e as dependências) e a hora do aparelho em que entrou na fila.
  endpoint_id: string | null;
  trip_id: string | null;
  queued_at: string;
  server_timestamp: string | null;
  status: OutboxStatus;
  attempt_count: number;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueCommand {
  organizationId: string;
  actorId: string;
  deviceId: string;
  operation: string;
  payload: Record<string, unknown>;
  version: number;
  dependencies?: string[];
  endpointId?: string;
  tripId?: string;
}

interface Options {
  now?: () => Date;
  audit?: (event: { action: 'outbox.discard'; itemId: string; actorId: string; organizationId: string }) => void | Promise<void>;
  maxAttempts?: number;
}

const TRANSITIONS: Record<OutboxStatus, readonly OutboxStatus[]> = {
  pending: ['syncing', 'discarded'],
  syncing: ['pending', 'synced', 'conflict', 'failed'],
  synced: [],
  // Spec 010: o conflito e a falha podem voltar a `pending` (reenviar, com a mesma chave de idempotência) além de ser descartados.
  conflict: ['discarded', 'pending'],
  failed: ['discarded', 'pending'],
  discarded: [],
};

export class SyncOutbox {
  private readonly now: () => Date;
  private readonly maxAttempts: number;

  constructor(private readonly database: LocalDatabase, private readonly options: Options = {}) {
    this.now = options.now ?? (() => new Date());
    this.maxAttempts = options.maxAttempts ?? 5;
  }

  async enqueue(command: EnqueueCommand): Promise<OutboxItem> {
    const timestamp = this.now().toISOString();
    const item: OutboxItem = {
      id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
      organization_id: command.organizationId,
      actor_id: command.actorId,
      device_id: command.deviceId,
      operation: command.operation,
      payload: structuredClone(command.payload),
      version: command.version,
      dependencies: [...(command.dependencies ?? [])],
      local_timestamp: timestamp,
      endpoint_id: command.endpointId ?? null,
      trip_id: command.tripId ?? null,
      queued_at: timestamp,
      server_timestamp: null,
      status: 'pending',
      attempt_count: 0,
      failure_reason: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    await this.database.put('local_outbox', item);
    return item;
  }

  async list(): Promise<OutboxItem[]> {
    return (await this.database.list('local_outbox')) as OutboxItem[];
  }

  // Só o que é desta conta e deste destino (Spec 010, RF-016): outra conta, organização ou destino nunca vê nem envia o item.
  async listOwned(owner: RecordOwner): Promise<OutboxItem[]> {
    return (await this.database.listOwned('local_outbox', owner)) as OutboxItem[];
  }

  async transition(id: string, next: OutboxStatus, details: { serverTimestamp?: string; failureReason?: string } = {}): Promise<OutboxItem> {
    const item = await this.find(id);
    if (!TRANSITIONS[item.status].includes(next)) {
      throw new Error(`Transição inválida da outbox: ${item.status} -> ${next}.`);
    }
    const updated: OutboxItem = {
      ...item,
      status: next,
      server_timestamp: next === 'synced' ? (details.serverTimestamp ?? null) : item.server_timestamp,
      failure_reason: details.failureReason ?? item.failure_reason,
      updated_at: this.now().toISOString(),
    };
    if (next === 'synced' && !updated.server_timestamp) throw new Error('Confirmação do servidor é obrigatória.');
    await this.database.put('local_outbox', updated);
    return updated;
  }

  async registerFailure(id: string, sanitizedReason: string): Promise<OutboxItem> {
    const item = await this.find(id);
    if (item.status !== 'syncing') throw new Error('Falha só pode ser registrada durante syncing.');
    const attemptCount = item.attempt_count + 1;
    const updated: OutboxItem = {
      ...item,
      attempt_count: attemptCount,
      status: attemptCount >= this.maxAttempts ? 'failed' : 'pending',
      failure_reason: sanitizedReason,
      updated_at: this.now().toISOString(),
    };
    await this.database.put('local_outbox', updated);
    return updated;
  }

  async discard(id: string, context: { authorized: boolean; actorId: string }): Promise<OutboxItem> {
    if (!context.authorized) throw new Error('Autorização obrigatória para descarte da outbox.');
    const item = await this.transition(id, 'discarded');
    await this.options.audit?.({ action: 'outbox.discard', itemId: id, actorId: context.actorId, organizationId: item.organization_id });
    return item;
  }

  // Confirmação do servidor (Spec 010, RF-025): o item sai do aparelho **por inteiro**, com o `payload` (posição, recebedor etc.).
  async confirm(id: string, serverTimestamp: string): Promise<void> {
    await this.transition(id, 'synced', { serverTimestamp });
    await this.removeConfirmed(id);
  }

  // Decisão de descartar um conflito ou uma falha: audita e remove o item por inteiro. A decisão no servidor acontece antes (conflict-service).
  async discardAndRemove(id: string, context: { authorized: boolean; actorId: string }): Promise<void> {
    if (!context.authorized) throw new Error('Autorização obrigatória para descarte da outbox.');
    const item = await this.find(id);
    if (item.status !== 'conflict' && item.status !== 'failed') throw new Error('Só conflito ou falha pode ser descartado.');
    await this.options.audit?.({ action: 'outbox.discard', itemId: id, actorId: context.actorId, organizationId: item.organization_id });
    await this.database.delete('local_outbox', id);
  }

  // Desfazer um pedido que ainda não saiu do aparelho (Spec 010, RF-005): remove o item sem criar evento no servidor. Só vale para `pending` e sem
  // nenhuma tentativa de envio; se já houve tentativa, o servidor pode ter recebido o pedido e o desfazer vira uma operação nova.
  async cancelPending(id: string): Promise<void> {
    const item = await this.find(id);
    if (item.status !== 'pending') throw new Error('Só um item pendente pode ser cancelado.');
    if (item.attempt_count > 0) throw new Error('O item já teve tentativa de envio e não pode ser cancelado.');
    await this.database.delete('local_outbox', id);
  }

  // Reenviar depois de corrigir a causa: volta a `pending` com a mesma chave de idempotência, para o servidor reconhecer o mesmo pedido.
  async resubmit(id: string): Promise<OutboxItem> {
    const item = await this.find(id);
    if (item.status !== 'conflict' && item.status !== 'failed') throw new Error('Só conflito ou falha pode ser reenviado.');
    const updated: OutboxItem = { ...item, status: 'pending', attempt_count: 0, failure_reason: null, updated_at: this.now().toISOString() };
    await this.database.put('local_outbox', updated);
    return updated;
  }

  async removeConfirmed(id: string): Promise<void> {
    const item = await this.find(id);
    if (item.status !== 'synced') throw new Error('Item não confirmado não pode ser removido.');
    await this.database.delete('local_outbox', id);
  }

  private async find(id: string): Promise<OutboxItem> {
    const item = (await this.list()).find((candidate) => candidate.id === id);
    if (!item) throw new Error('Item da outbox não encontrado na empresa ativa.');
    return item;
  }
}
