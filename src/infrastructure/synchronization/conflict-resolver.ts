import { LocalDatabase, type LocalRecord } from '@/infrastructure/local-database/local-database';

export type ConflictKind =
  | 'concurrent_update'
  | 'remote_deleted'
  | 'permission_removed'
  | 'tenant_suspended'
  | 'session_expired'
  | 'duplicate'
  | 'missing_dependency'
  | 'endpoint_changed'
  // Spec 010: conflitos das operações de campo, um por código de recusa do servidor.
  | 'trip_closed'
  | 'invalid_transition'
  | 'stop_closed'
  | 'item_not_found'
  | 'stale_operation'
  | 'version_conflict'
  | 'validation_rejected';

export type OutboxOutcome = 'conflict' | 'failed' | 'pending' | 'blocked' | 'defer' | 'synced';
export type ConflictDecision = 'keep_local' | 'keep_remote' | 'discard_local';

export interface ConflictTreatment {
  autoResolve: false;
  preserveBoth: true;
  outboxOutcome: OutboxOutcome;
}

interface VersionSnapshot { version: number; data: Record<string, unknown> | null }

// Resumo do que a pessoa fez, **sem dado sensível** (Spec 010, RF-012 e RF-025): os dados originais completos ficam só no item da fila.
export interface FieldConflictSummary {
  operation: string;
  serial?: string;
  stopPosition?: number;
  queuedAt: string;
  positionInformed?: boolean;
  recipientInformed?: boolean;
}

export interface FieldConflictInput {
  organizationId: string;
  outboxItemId: string;
  tripId: string;
  // Código de recusa do servidor (INVALID_TRANSITION, TRIP_CLOSED, ...).
  reasonCode: string;
  summary: FieldConflictSummary;
  // Estado atual no servidor, também sem dado sensível (por exemplo, a situação da viagem).
  remote: Record<string, unknown>;
}

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
  trip_closed: 'conflict',
  invalid_transition: 'conflict',
  stop_closed: 'conflict',
  item_not_found: 'conflict',
  stale_operation: 'conflict',
  version_conflict: 'conflict',
  validation_rejected: 'conflict',
};

// Código de recusa do servidor -> tipo do conflito de campo. Código desconhecido vira `validation_rejected` (a pessoa decide).
const FIELD_KINDS: Record<string, ConflictKind> = {
  TRIP_CLOSED: 'trip_closed',
  INVALID_TRANSITION: 'invalid_transition',
  STOP_CLOSED: 'stop_closed',
  NOT_FOUND: 'item_not_found',
  STALE_OFFLINE_OPERATION: 'stale_operation',
  VERSION_CONFLICT: 'version_conflict',
  VALIDATION_FAILED: 'validation_rejected',
  // Dependente de uma operação descartada: vira conflito para a pessoa decidir (Spec 010).
  MISSING_DEPENDENCY: 'missing_dependency',
};

// Chaves que nunca podem entrar no resumo do conflito: posição, recebedor, resultados, anexos e valores lidos.
const SENSITIVE_KEY = /(latitude|longitude|position(?!ed)|recipient(?!informed)|signature|photo|results|value|serial_number|identifier|name)/i;
function assertNoSensitiveData(data: Record<string, unknown>): void {
  for (const key of Object.keys(data)) {
    if (key === 'serial' || key === 'positionInformed' || key === 'recipientInformed' || key === 'stopPosition') continue;
    if (SENSITIVE_KEY.test(key)) throw new Error(`O resumo do conflito não pode ter dado sensível (${key}).`);
  }
}

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

  // Conflito de uma operação de campo (Spec 010): o registro guarda só o resumo; os dados originais ficam no item da fila que ele referencia.
  // Um segundo conflito do mesmo item reaproveita o registro aberto.
  async registerFieldConflict(input: FieldConflictInput): Promise<ConflictRecord> {
    assertNoSensitiveData(input.summary as unknown as Record<string, unknown>);
    assertNoSensitiveData(input.remote);
    const kind = FIELD_KINDS[input.reasonCode] ?? 'validation_rejected';
    const open = (await this.list()).find((candidate) => candidate.outbox_item_id === input.outboxItemId && candidate.status === 'open');
    const record: ConflictRecord = {
      id: open?.id ?? crypto.randomUUID(),
      organization_id: input.organizationId,
      outbox_item_id: input.outboxItemId,
      entity: 'trip',
      entity_id: input.tripId,
      kind,
      local_version: { version: 0, data: { ...input.summary } },
      remote_version: { version: 0, data: { ...input.remote } },
      status: 'open',
      decision: null,
      created_at: open?.created_at ?? this.now().toISOString(),
      resolved_at: null,
    };
    await this.database.put('local_sync_conflicts', record);
    return record;
  }

  // Fecha o conflito com a decisão (`discard_local` descarta e `keep_local` reenvia) e **limpa** os dois resumos: nada fica no registro.
  // A permissão e a decisão no servidor são conferidas antes, em `conflict-service` (resolve_sync_conflict, trip.operate).
  async closeFieldConflict(id: string, decision: 'discard_local' | 'keep_local'): Promise<ConflictRecord> {
    const conflict = (await this.list()).find((candidate) => candidate.id === id);
    if (!conflict) throw new Error('Conflito não encontrado no tenant ativo.');
    if (conflict.status === 'resolved') throw new Error('Conflito já resolvido.');
    const closed: ConflictRecord = {
      ...conflict,
      status: 'resolved',
      decision,
      local_version: { version: conflict.local_version.version, data: null },
      remote_version: { version: conflict.remote_version.version, data: null },
      resolved_at: this.now().toISOString(),
    };
    await this.database.put('local_sync_conflicts', closed);
    return closed;
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
