import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createTripAttachmentsHandler, type AttachmentsGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

const BUCKET = 'trip-evidence';

// A chave de serviço fica só aqui, no servidor. O ator e a sessão vêm do token validado pelo Auth; o banco confere vínculo, papel e permissão a cada chamada.
function createGateway(): AttachmentsGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      return { userId: data.user.id, sessionId: claims.session_id, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    async rpc(name, args) {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error('rpc_failed');
      if (data === null || typeof data !== 'object') throw new Error('rpc_failed');
      return data as Record<string, unknown>;
    },
    // Sucessos são auditados na mesma transação da RPC; negações entram aqui, sem alvo nem caminho.
    async audit(event) {
      const { error } = await admin.from('audit_logs').insert({
        actor_user_id: event.actorId, action: event.action, target_type: 'trip', result: event.result,
        reason_code: event.reason, origin: 'function:trip-attachments', metadata: {},
      });
      if (error) throw new Error('audit_failed');
    },
    // `upsert`: o reenvio depois de uma falha entre o objeto e a linha grava de novo o mesmo caminho, sem erro nem duplicação.
    async store(path, bytes, contentType) {
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true, cacheControl: '0' });
      if (error) throw new Error('storage_failed');
    },
    async remove(path) {
      const { error } = await admin.storage.from(BUCKET).remove([path]);
      if (error) throw new Error('storage_failed');
    },
  };
}

export default { fetch: (request: Request) => createTripAttachmentsHandler(createGateway())(request) };
