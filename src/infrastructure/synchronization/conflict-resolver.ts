import { LocalDatabase, type LocalRecord } from '@/infrastructure/local-database/local-database';

export type ConflictKind =
  | 'concurrent_update'
  | 'remote_deleted'
  | 'permission_removed'
  | 'tenant_suspended'
  | 'session_expired'
  | 'duplicate'
  | 'missing_dependency'
  | 'endpoint_changed';

export type OutboxOutcome = 'conflict' | 'failed' | 'pending' | 'blocked' | 'defer' | 'synced';
export type ConflictDecision = 'keep_local' | 'keep_remote' | 'discard_local';

export interface ConflictTreatment {
  autoResolve: false;
  preserveBoth: true;
  outboxOutcome: OutboxOutcome;
}

interface VersionSnapshot { version: number; data: Record<string, unknown> | null }

export interface ConflictInput {
  organizationId: string;
  outboxItemId: string;
  entity: string;
  entityId: string;
  kind: ConflictKind;
  localVersion: VersionSnapshot;
  remoteVersion: VersionSnapshot;
}

export interface ConflictRecord extends LocalRecord {
  id: string;
  organization_id: string;
  outbox_item_id: string;
  entity: string;
  entity_id: string;
  kind: ConflictKind;
  local_version: VersionSnapshot;
  remote_version: VersionSnapshot;
  status: 'open' | 'resolved';
  decision: ConflictDecision | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ResolutionContext {
  actorId: string;
  sessionValid: boolean;
  justification: string;
  permissions: readonly string[];
  scope: 'tenant' | 'global';
  decision: ConflictDecision;
}

export interface ConflictAuditEvent {
  action: 'sync.conflict.resolve';
  actorId: string;
  organizationId: string;
  conflictId: string;
  decision: ConflictDecision;
  localVersion: number;
  remoteVersion: number;
}

interface Options {
  now?: () => Date;
  audit?: (event: ConflictAuditEvent) => void | Promise<void>;
}

// "Última escrita vence" nunca é aplicada: todo tratamento preserva as duas versões.
const OUTCOMES: Record<ConflictKind, OutboxOutcome> = {
  concurrent_update: 'conflict',
  remote_deleted: 'conflict',
  permission_removed: 'failed',
  tenant_suspended: 'blocked',
  session_expired: 'pending',
  duplicate: 'synced',
  missing_dependency: 'defer',
  endpoint_changed: 'conflict',
};

const REQUIRED_PERMISSION = { tenant: 'tenant.manage', global: 'platform.manage' } as const;

export class ConflictResolver {
  private readonly now: () => Date;

  constructor(private readonly database: LocalDatabase, private readonly options: Options = {}) {
    this.now = options.now ?? (() => new Date());
  }

  classify(kind: ConflictKind): ConflictTreatment {
    return { autoResolve: false, preserveBoth: true, outboxOutcome: OUTCOMES[kind] };
  }

  async register(input: ConflictInput): Promise<ConflictRecord> {
    const record: ConflictRecord = {
      id: crypto.randomUUID(),
      organization_id: input.organizationId,
      outbox_item_id: input.outboxItemId,
      entity: input.entity,
      entity_id: input.entityId,
      kind: input.kind,
      local_version: structuredClone(input.localVersion),
      remote_version: structuredClone(input.remoteVersion),
      status: 'open',
      decision: null,
      created_at: this.now().toISOString(),
      resolved_at: null,
    };
    await this.database.put('local_sync_conflicts', record);
    return record;
  }

  async list(): Promise<ConflictRecord[]> {
    return (await this.database.list('local_sync_conflicts')) as ConflictRecord[];
  }

  async hasOpenConflicts(): Promise<boolean> {
    return (await this.list()).some((conflict) => conflict.status === 'open');
  }

  async resolve(id: string, context: ResolutionContext): Promise<ConflictRecord> {
    if (!context.sessionValid) throw new Error('Sessão vigente é obrigatória para resolver conflito.');
    if (!context.justification.trim()) throw new Error('Justificativa é obrigatória para resolver conflito.');
    if (!context.permissions.includes(REQUIRED_PERMISSION[context.scope])) {
      throw new Error(`Permissão ${REQUIRED_PERMISSION[context.scope]} é obrigatória para o escopo ${context.scope}.`);
    }
    const conflict = (await this.list()).find((candidate) => candidate.id === id);
    if (!conflict) throw new Error('Conflito não encontrado no tenant ativo.');
    if (conflict.status === 'resolved') throw new Error('Conflito já resolvido.');

    // Ambas as versões permanecem no registro; somente a decisão é acrescentada.
    const resolved: ConflictRecord = {
      ...conflict,
      status: 'resolved',
      decision: context.decision,
      resolved_at: this.now().toISOString(),
    };
    await this.database.put('local_sync_conflicts', resolved);
    await this.options.audit?.({
      action: 'sync.conflict.resolve',
      actorId: context.actorId,
      organizationId: conflict.organization_id,
      conflictId: conflict.id,
      decision: context.decision,
      localVersion: conflict.local_version.version,
      remoteVersion: conflict.remote_version.version,
    });
    return resolved;
  }
}
