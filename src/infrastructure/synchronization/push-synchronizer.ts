import { type SyncOutbox } from './sync-outbox';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClientManager } from '../connectivity/supabase-client-manager';

export interface PushResult {
  successful: number;
  failed: number;
  conflicts: number;
  interrupted: boolean;
  interruptionReason?: string;
}

export class PushSynchronizer {
  private isPushing = false;

  constructor(
    private readonly outbox: SyncOutbox,
    private readonly clientManager: SupabaseClientManager<SupabaseClient>
  ) {}

  async push(): Promise<PushResult> {
    if (this.isPushing) {
      throw new Error('Push já está em andamento.');
    }
    this.isPushing = true;
    const result: PushResult = { successful: 0, failed: 0, conflicts: 0, interrupted: false };
    
    try {
      let pendingItems = (await this.outbox.list()).filter((item) => item.status === 'pending');
      
      while (pendingItems.length > 0) {
        // Encontra itens que não têm dependências pendentes
        const syncedIds = new Set((await this.outbox.list()).filter((item) => item.status === 'synced').map((i) => i.id));
        const readyItems = pendingItems.filter((item) => 
          item.dependencies.every((depId) => syncedIds.has(depId))
        );

        if (readyItems.length === 0) {
          // Deadlock de dependências ou dependência em conflito/falha
          break; 
        }

        for (const item of readyItems) {
          const client = this.clientManager.current();
          if (!client) {
            result.interrupted = true;
            result.interruptionReason = 'network_error';
            return result;
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
        pendingItems = (await this.outbox.list()).filter((item) => item.status === 'pending');
      }
    } finally {
      this.isPushing = false;
    }
    
    return result;
  }
}
