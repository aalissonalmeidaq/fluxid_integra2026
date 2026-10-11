import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createQueryTripsHandler, type OperationsGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

// A chave de serviço fica só aqui, no servidor. O ator, a sessão e o nível de autenticação (aal) vêm do token validado pelo Auth; o
// banco confere vínculo, papel e permissão a cada chamada (contracts/operacoes-servidor.md).
function createGateway(): OperationsGateway {
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
      if (error || data === null || typeof data !== 'object') throw new Error('rpc_failed');
      return data as Record<string, unknown>;
    },
    // Consultas não são auditadas no sucesso; negações e falhas entram aqui, sem alvo nem organização solicitada.
    async audit(event) {
      const { error } = await admin.from('audit_logs').insert({
        actor_user_id: event.actorId, action: event.action, target_type: 'trip', result: event.result,
        reason_code: event.reason, origin: 'function:query-trips', metadata: {},
      });
      if (error) throw new Error('audit_failed');
    },
  };
}

export default { fetch: (request: Request) => createQueryTripsHandler(createGateway())(request) };
