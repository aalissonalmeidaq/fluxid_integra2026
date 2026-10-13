import { type OutboxItem, type SyncOutbox } from './sync-outbox';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClientManager } from '../connectivity/supabase-client-manager';
import type { RecordOwner } from '../local-database/local-database';
import type { Executor, ExecutorOutcome } from './operation-executors';

export interface PushResult {
  successful: number;
  failed: number;
  conflicts: number;
  interrupted: boolean;
  interruptionReason?: string;
  // Spec 010 (RF-012): conflitos das operações de campo. Ficam preservados e visíveis para uma pessoa decidir, mas **não** bloqueiam a área protegida
  // (o portão da Spec 002 só para por `conflicts`).
  fieldConflicts?: number;
  // Spec 010 (RF-016, RN-007): itens da conta que esperam outro destino Supabase. Nunca são enviados a este; a tela avisa.
  endpointMismatch?: number;
}

export interface PushOptions {
  // Executores por operação (Spec 010): a operação que tem executor vai pelo servidor do domínio (manage-trips); as demais seguem pela função
  // genérica `sync-command` da Spec 002.
  executors?: Partial<Record<string, Executor>>;
  // Conta e destino ativos: só os itens deles são enviados (RF-016). Sem isso, vale o comportamento da Spec 002 (todo o tenant ativo).
  owner?: RecordOwner;
  // Depois que o servidor confirma (o item já saiu da fila) e quando ele é recusado (o item virou conflito e foi preservado).
  onSynced?: (item: OutboxItem, outcome: Extract<ExecutorOutcome, { kind: 'synced' }>) => void | Promise<void>;
  onConflict?: (item: OutboxItem, outcome: Extract<ExecutorOutcome, { kind: 'conflict' }>) => void | Promise<void>;
  // Itens que este envio não toca (o portão de inicialização da Spec 002 deixa as operações de campo para o envio próprio da fila de campo).
  skip?: (item: OutboxItem) => boolean;
}

export class PushSynchronizer {
  private isPushing = false;

  constructor(
    private readonly outbox: SyncOutbox,
    private readonly clientManager: SupabaseClientManager<SupabaseClient>,
    private readonly options: PushOptions = {},
  ) {}

  private list(): Promise<OutboxItem[]> {
    return this.options.owner ? this.outbox.listOwned(this.options.owner) : this.outbox.list();
  }

  private async pending(): Promise<OutboxItem[]> {
    return (await this.list()).filter((item) => item.status === 'pending' && !this.options.skip?.(item));
  }

  async push(): Promise<PushResult> {
    if (this.isPushing) {
      throw new Error('Push já está em andamento.');
    }
    this.isPushing = true;
    const result: PushResult = { successful: 0, failed: 0, conflicts: 0, interrupted: false };

    try {
      if (this.options.owner) {
        const all = await this.outbox.list();
        const waiting = all.filter((item) => item.actor_id === this.options.owner!.actorId && item.status === 'pending' && item.endpoint_id !== null && item.endpoint_id !== this.options.owner!.endpointId);
        if (waiting.length > 0) result.endpointMismatch = waiting.length;
      }

      let pendingItems = await this.pending();

      while (pendingItems.length > 0) {
        // Dependência satisfeita: o item de que depende já foi confirmado (`synced`) ou já saiu da fila por ter sido confirmado (Spec 010: a
        // confirmação remove o item por inteiro). Enquanto ele existir em outro estado (pendente, conflito, falha), os dependentes esperam.
        const current = await this.list();
        const byId = new Map(current.map((item) => [item.id, item]));
        const readyItems = pendingItems.filter((item) => item.dependencies.every((depId) => {
          const dependency = byId.get(depId);
          return dependency === undefined || dependency.status === 'synced';
        }));

        if (readyItems.length === 0) {
          // Dependências em conflito ou falha: ficam para a decisão da pessoa.
          break;
        }

        for (const item of readyItems) {
          const client = this.clientManager.current();
          if (!client) {
            result.interrupted = true;
            result.interruptionReason = 'network_error';
            return result;
          }

          const executor = this.options.executors?.[item.operation];
          if (executor) {
            const stop = await this.runExecutor(item, executor, result);
            if (stop) return result;
            continue;
          }

          // Transição para syncing
          await this.outbox.transition(item.id, 'syncing');

          try {
            // Chamada à Edge Function (idempotente)
            const { error } = await client.functions.invoke('sync-command', {
              body: {
                organization_id: item.organization_id,
                idempotency_key: item.idempotency_key,
                operation: item.operation,
                version: item.version,
                device_id: item.device_id,
                payload: item.payload,
              },
            });

            if (error) {
              // O supabase-js devolve a falha em vez de lançar. Sem `context.status` não houve resposta do servidor
              // (rede); o motivo gravado é sempre um código sanitizado, nunca a mensagem bruta do erro.
              const context = (error as { context?: { status?: unknown } }).context;
              const status = typeof context?.status === 'number' ? context.status : null;

              if (status === 409) {
                await this.outbox.transition(item.id, 'conflict');
                result.conflicts++;
              } else if (status === 401 || status === 403) {
                await this.outbox.transition(item.id, 'failed', { failureReason: 'auth_rejected' });
                result.failed++;
                result.interrupted = true;
                result.interruptionReason = 'auth_error';
                return result;
              } else if (status === null || status >= 500) {
                // Rede ou servidor indisponível: uma tentativa contada, sem laço imediato; a nova tentativa é do coordenador.
                await this.outbox.registerFailure(item.id, status === null ? 'network_error' : 'server_error');
                result.failed++;
                result.interrupted = true;
                result.interruptionReason = status === null ? 'network_error' : 'server_error';
                return result;
              } else {
                // Rejeição definitiva (validação, integridade): repetir não muda o resultado.
                await this.outbox.transition(item.id, 'failed', { failureReason: `rejected_${status}` });
                result.failed++;
              }
            } else {
              // Sucesso
              await this.outbox.transition(item.id, 'synced', { serverTimestamp: new Date().toISOString() });
              result.successful++;
            }
          } catch {
            // Queda de rede ou erro inesperado
            await this.outbox.registerFailure(item.id, 'network_error');
            result.failed++;
            result.interrupted = true;
            result.interruptionReason = 'network_error';
            return result;
          }
        }

        // Atualiza a lista para o próximo ciclo
        pendingItems = await this.pending();
      }
    } finally {
      this.isPushing = false;
    }

    return result;
  }

  // Envia um item de campo pelo executor da operação. Devolve `true` quando o envio deve parar (sessão, rede ou servidor).
  private async runExecutor(item: OutboxItem, executor: Executor, result: PushResult): Promise<boolean> {
    await this.outbox.transition(item.id, 'syncing');
    const syncing: OutboxItem = { ...item, status: 'syncing' };
    let outcome: ExecutorOutcome;
    try {
      outcome = await executor(syncing);
    } catch {
      // Exceção inesperada: tratada como queda de rede, sem repetir a mensagem do erro (pode ter dado sensível).
      outcome = { kind: 'retry', reason: 'network' };
    }
    switch (outcome.kind) {
      case 'synced':
        // Confirmado pelo servidor: o item sai do aparelho por inteiro, com o payload (RF-025).
        await this.outbox.confirm(item.id, outcome.serverTimestamp);
        result.successful++;
        await this.options.onSynced?.(item, outcome);
        return false;
      case 'conflict':
        // Recusado por regra de domínio: preservado como conflito, com o código do motivo, até uma pessoa decidir (RF-012).
        await this.outbox.transition(item.id, 'conflict', { failureReason: outcome.reasonCode });
        result.fieldConflicts = (result.fieldConflicts ?? 0) + 1;
        await this.options.onConflict?.(item, outcome);
        return false;
      case 'interrupt':
        // Sem sessão ou sem permissão: o item volta a pendente sem contar tentativa; a fila fica como está.
        await this.outbox.transition(item.id, 'pending');
        result.interrupted = true;
        result.interruptionReason = 'auth_error';
        return true;
      case 'retry': {
        const reason = outcome.reason === 'network' ? 'network_error' : 'server_error';
        await this.outbox.registerFailure(item.id, reason);
        result.failed++;
        result.interrupted = true;
        result.interruptionReason = reason;
        return true;
      }
    }
  }
}
