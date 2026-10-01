import { createClient } from '@supabase/supabase-js';
import { createRetentionCleanupHandler, type CleanupGateway, type CleanupItem } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

function createGateway(): CleanupGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    secret: () => (globalThis as RuntimeEnvironment).Deno?.env.get('RETENTION_JOB_SECRET'),
    async takeBatch(limit) {
      const { data, error } = await admin.rpc('take_storage_cleanup_batch', { p_limit: limit });
      if (error) throw new Error('rpc_failed');
      return (Array.isArray(data) ? data : []) as CleanupItem[];
    },
    async removeObjects(bucket, paths) {
      // Remover objeto já inexistente não é erro; só falha de serviço impede a conclusão do item.
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) throw new Error('storage_failed');
    },
    async complete(paths) {
      const { data, error } = await admin.rpc('complete_storage_cleanup', { p_paths: paths });
      if (error) throw new Error('rpc_failed');
      return Number(data ?? 0);
    },
  };
}

export default { fetch: (request: Request) => createRetentionCleanupHandler(createGateway())(request) };
