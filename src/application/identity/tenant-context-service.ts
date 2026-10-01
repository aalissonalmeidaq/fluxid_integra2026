import type { LocalDatabase } from '@/infrastructure/local-database/local-database';
import {
  eligibleOptions,
  requestSelection,
  resolveSelection,
  type MembershipRecord,
  type SelectionState,
  type TenantOption,
} from '@/domain/identity/tenant-selection';

export interface TenantContextPorts {
  database: Pick<LocalDatabase, 'lock' | 'unlock' | 'activeTenant'>;
  // Fonte confiável dos vínculos do usuário (decidida pelo servidor, com RLS); nunca o cliente.
  fetchMemberships: () => Promise<MembershipRecord[]>;
  pauseMutations?: () => void;
  resumeMutations?: () => void;
}

export interface TenantSnapshot {
  status: 'idle' | 'ready' | 'error';
  selection: SelectionState;
  // Opções elegíveis da última consulta confiável; permite oferecer a troca de organização.
  options: readonly TenantOption[];
  activeOrganizationId: string | null;
}

export type SelectResult =
  | { ok: true; snapshot: TenantSnapshot }
  | { ok: false; reason: 'not_eligible' | 'unavailable' | 'switch_failed' };

type ClearHandler = () => void | Promise<void>;

// Coordena o tenant ativo: um por vez, com base local, caches e estado isolados por organização (RF-026, RF-027, RF-059).
// A elegibilidade é reavaliada na fonte confiável a cada seleção; o identificador do cliente é apenas um pedido.
export class TenantContextService {
  private status: TenantSnapshot['status'] = 'idle';
  private selection: SelectionState = { kind: 'none' };
  private options: readonly TenantOption[] = [];
  private active: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly clearHandlers = new Set<ClearHandler>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly ports: TenantContextPorts) {}

  snapshot(): TenantSnapshot {
    return { status: this.status, selection: this.selection, options: this.options, activeOrganizationId: this.active };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // Cache de interface, consultas e ações pendentes do contexto anterior devem ser descartados aqui.
  onClear(handler: ClearHandler): () => void {
    this.clearHandlers.add(handler);
    return () => { this.clearHandlers.delete(handler); };
  }

  // Carrega e reavalia o contexto: seleciona sozinho com um único vínculo, exige escolha com vários
  // e descarta o tenant ativo que deixou de ser elegível (suspenso, bloqueado ou removido).
  load(): Promise<TenantSnapshot> {
    return this.serial(async () => {
      let records: MembershipRecord[];
      try {
        records = await this.ports.fetchMemberships();
      } catch {
        // Sem resposta confiável não se concede nem revoga o contexto; o servidor continua decidindo cada operação.
        this.status = 'error';
        this.emit();
        return this.snapshot();
      }
      const options = eligibleOptions(records);
      const next = resolveSelection(options, this.active);
      try {
        if (next.kind === 'selected') {
          if (next.option.organizationId !== this.active) await this.activate(next.option.organizationId);
        } else if (this.active) {
          await this.deactivate();
        }
        this.selection = next;
        this.options = options;
      } catch {
        this.failClosed();
        this.selection = { kind: 'none' };
        this.options = [];
      }
      this.status = 'ready';
      this.emit();
      return this.snapshot();
    });
  }

  select(requestedOrganizationId: unknown): Promise<SelectResult> {
    return this.serial(async (): Promise<SelectResult> => {
      let records: MembershipRecord[];
      try {
        records = await this.ports.fetchMemberships();
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      const options = eligibleOptions(records);
      const request = requestSelection(options, requestedOrganizationId);
      if (!request.ok) return { ok: false, reason: 'not_eligible' };

      if (request.option.organizationId !== this.active) {
        try {
          await this.activate(request.option.organizationId);
        } catch {
          this.failClosed();
          this.selection = resolveSelection(options, null);
          this.options = options;
          this.emit();
          return { ok: false, reason: 'switch_failed' };
        }
      }
      this.selection = { kind: 'selected', option: request.option };
      this.options = options;
      this.status = 'ready';
      this.emit();
      return { ok: true, snapshot: this.snapshot() };
    });
  }

  // Gate de sincronização: o tenant ativo continua elegível no servidor e a base local está desbloqueada nele.
  // Não altera o contexto; sem resposta confiável, não confirma.
  confirm(): Promise<boolean> {
    return this.serial(async () => {
      const active = this.active;
      if (!active) return false;
      try {
        if (this.ports.database.activeTenant !== active) return false;
        const options = eligibleOptions(await this.ports.fetchMemberships());
        return options.some((option) => option.organizationId === active);
      } catch {
        return false;
      }
    });
  }

  // Fim da sessão: trava a base e limpa o contexto. A pendência do tenant permanece preservada e inacessível
  // até nova autenticação equivalente ou descarte autorizado e auditado.
  release(): Promise<void> {
    return this.serial(async () => {
      this.ports.database.lock();
      this.active = null;
      await this.runClearHandlers().catch(() => undefined);
      this.selection = { kind: 'none' };
      this.options = [];
      this.status = 'idle';
      this.emit();
    });
  }

  private async activate(organizationId: string): Promise<void> {
    this.ports.pauseMutations?.();
    try {
      // Trava antes de limpar e só destrava o novo tenant depois: nenhum dado do anterior fica alcançável.
      this.ports.database.lock();
      this.active = null;
      await this.runClearHandlers();
      this.ports.database.unlock(organizationId);
      this.active = organizationId;
    } finally {
      this.ports.resumeMutations?.();
    }
  }

  private async deactivate(): Promise<void> {
    this.ports.pauseMutations?.();
    try {
      this.ports.database.lock();
      this.active = null;
      await this.runClearHandlers();
    } finally {
      this.ports.resumeMutations?.();
    }
  }

  private failClosed(): void {
    this.ports.database.lock();
    this.active = null;
  }

  private async runClearHandlers(): Promise<void> {
    for (const handler of [...this.clearHandlers]) await handler();
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
