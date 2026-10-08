import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createManageRegistryHandler, type OperationsGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

// Exceções do banco (gatilhos) que a borda traduz em código de negócio: o gateway preserva a mensagem só destas.
const KNOWN_EXCEPTIONS = new Set(['anonymized_record']);

// A chave de serviço fica só aqui, no servidor. O ator, a sessão e o nível de autenticação (aal) vêm do token validado pelo Auth; o
// banco confere vínculo, papel e permissão a cada chamada (contracts/operacoes-servidor.md).
function createGateway(): OperationsGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      const aal = claims.aal === 'aal2' ? 'aal2' : 'aal1';
      // O segundo fator já foi provado pelo Auth neste token: a sessão governada sobe junto, para o banco repetir a exigência (RF-055).
      if (aal === 'aal2') await admin.rpc('start_user_session', { p_user_id: data.user.id, p_session_id: claims.session_id, p_aal: 'aal2' });
      return { userId: data.user.id, sessionId: claims.session_id, aal };
    },
    async rpc(name, args) {
      const { data, error } = await admin.rpc(name, args);
      if (error) throw new Error(KNOWN_EXCEPTIONS.has(error.message) ? error.message : 'rpc_failed');
      if (data === null || typeof data !== 'object') throw new Error('rpc_failed');
      return data as Record<string, unknown>;
    },
    // Sucessos são auditados na mesma transação da RPC; negações e falhas entram aqui, sem alvo nem organização solicitada.
    async audit(event) {
      const { error } = await admin.from('audit_logs').insert({
        actor_user_id: event.actorId, action: event.action, target_type: 'registry', result: event.result,
        reason_code: event.reason, origin: 'function:manage-registry', metadata: {},
      });
      if (error) throw new Error('audit_failed');
    },
  };
}

export default { fetch: (request: Request) => createManageRegistryHandler(createGateway())(request) };
