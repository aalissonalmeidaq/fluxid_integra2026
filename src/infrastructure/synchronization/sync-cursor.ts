import { LocalDatabase } from '../local-database/local-database';

export class SyncCursor {
  constructor(private readonly database: LocalDatabase) {}

  async advance(collection: string, origin: string, timestamp: string): Promise<void> {
    const tenant = this.database.activeTenant;
    const id = `${tenant}_${collection}_${origin}`;
    
    await this.database.put('local_sync_cursors', {
      id,
      organization_id: tenant,
      collection,
      origin,
      timestamp,
    });
  }

  async get(collection: string, origin: string): Promise<string | null> {
    const tenant = this.database.activeTenant;
    const id = `${tenant}_${collection}_${origin}`;
    
    const records = await this.database.list('local_sync_cursors');
    const record = records.find(r => r.id === id);
    
    return record ? (record.timestamp as string) : null;
  }
}
