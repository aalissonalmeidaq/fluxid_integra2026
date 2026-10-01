import { SupabaseClient } from '@supabase/supabase-js';
import { SyncCursor } from './sync-cursor';
import { LocalDatabase } from '../local-database/local-database';
import { SyncOutbox } from './sync-outbox';
import { SupabaseClientManager } from '../connectivity/supabase-client-manager';

export class PullSynchronizer {
  constructor(
    private readonly clientManager: SupabaseClientManager<SupabaseClient>,
    private readonly cursor: SyncCursor,
    private readonly database: LocalDatabase,
    private readonly outbox: SyncOutbox
  ) {}

  async pull<T extends { updated_at: string }>(
    collection: string,
    fetcher: (client: SupabaseClient, cursorTimestamp: string | null) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
    applier: (data: T[], db: LocalDatabase) => Promise<void>
  ): Promise<void> {
    // Regra: pull deve ser posterior ao push
    const pendingItems = (await this.outbox.list()).filter(item => item.status === 'pending' || item.status === 'syncing');
    if (pendingItems.length > 0) {
      throw new Error('Push deve preceder o pull');
    }

    const client = this.clientManager.current();
    if (!client) {
      throw new Error('Nenhum cliente ativo disponível para pull');
    }

    const currentCursor = await this.cursor.get(collection, this.clientManager.currentEndpoint()?.kind || 'cloud');

    const { data, error } = await fetcher(client, currentCursor);

    if (error) {
      throw new Error(error.message || 'Erro ao realizar pull');
    }

    if (!data || data.length === 0) {
      return;
    }

    // Ordena para garantir que pegaremos a data mais recente
    const sortedData = [...data].sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
    const latestTimestamp = sortedData.at(-1)?.updated_at;
    if (!latestTimestamp) return;

    // Aplicação atômica:
    // O applier deve lançar exceção em caso de conflito, impedindo o avanço do cursor
    await applier(sortedData, this.database);

    // Se a aplicação for concluída sem erros, avança o cursor
    await this.cursor.advance(collection, this.clientManager.currentEndpoint()?.kind || 'cloud', latestTimestamp);
  }
}
