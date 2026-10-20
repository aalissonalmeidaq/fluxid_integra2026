import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createPlatformSealsHandler, type PlatformIdentity, type PlatformSealsGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

// A chave de serviço fica só aqui, no servidor. O ator, a sessão e o aal vêm do token validado pelo Auth; o banco confere de novo a
// sessão e o platform.manage a cada RPC (Spec 013, contracts/operacoes-plataforma.md).
function createGateway(): PlatformSealsGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token): Promise<PlatformIdentity | null> {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      const aal = claims.aal === 'aal2' ? 'aal2' : 'aal1';
      if (aal === 'aal2') await admin.rpc('start_user_session', { p_user_id: data.user.id, p_session_id: claims.session_id, p_aal: 'aal2' });
      const { data: context, error: contextError } = await admin.rpc('global_actor_context', { p_actor: data.user.id, p_session: claims.session_id });
      if (contextError || !context) return null;
      const ctx = context as { session_active: boolean; can_manage_platform: boolean };
      return { userId: data.user.id, sessionId: claims.session_id, aal, sessionActive: ctx.session_active, canManagePlatform: ctx.can_manage_platform };
    },
    async rpc(name, args) {
      const { data, error } = await admin.rpc(name, args);
      if (error || data === null || typeof data !== 'object') throw new Error('rpc_failed');
      return data as Record<string, unknown>;
    },
    // Sucessos são auditados na mesma transação da RPC; negações e falhas entram aqui, na auditoria da plataforma (sem organização).
    async audit(event) {
      const { error } = await admin.from('audit_logs').insert({
        actor_user_id: event.actorId, action: event.action, target_type: 'seal_enrollment', result: event.result,
        reason_code: event.reason, metadata: {},
      });
      if (error) throw new Error('audit_failed');
    },
  };
}

export default { fetch: (request: Request) => createPlatformSealsHandler(createGateway())(request) };
