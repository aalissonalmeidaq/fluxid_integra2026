import { LocalDatabase, type LocalRecord } from '@/infrastructure/local-database/local-database';

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
  conflict: ['discarded'],
  failed: ['discarded'],
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

  async removeConfirmed(id: string): Promise<void> {
    const item = await this.find(id);
    if (item.status !== 'synced') throw new Error('Item não confirmado não pode ser removido.');
    await this.database.delete('local_outbox', id);
  }

  private async find(id: string): Promise<OutboxItem> {
    const item = (await this.list()).find((candidate) => candidate.id === id);
    if (!item) throw new Error('Item da outbox não encontrado no tenant ativo.');
    return item;
  }
}
