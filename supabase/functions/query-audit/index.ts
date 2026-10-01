import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createQueryAuditHandler, type AuditGateway, type AuditQueryResult } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

function createGateway(): AuditGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      return { userId: data.user.id, sessionId: claims.session_id, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    async query(input) {
      const { data, error } = await admin.rpc('query_audit_events', {
        p_actor: input.actorId, p_session: input.sessionId, p_scope: input.scope, p_organization: input.organizationId ?? null,
        p_from: input.from ?? null, p_to: input.to ?? null, p_action: input.action ?? null, p_result: input.result ?? null,
        p_actor_filter: input.actorFilter ?? null, p_target_type: input.targetType ?? null,
        p_before_at: input.beforeAt ?? null, p_before_id: input.beforeId ?? null, p_limit: input.limit ?? null,
      });
      if (error) throw new Error('rpc_failed');
      return data as AuditQueryResult;
    },
    // A consulta global bem-sucedida é auditada dentro da própria RPC; negações e falhas entram aqui, sem tenant nem alvo.
    async audit(event) {
      const { error } = await admin.from('audit_logs').insert({
        actor_user_id: event.actorId, action: event.action, target_type: 'audit', result: event.result,
        reason_code: event.reason, metadata: {}, origin: 'query-audit',
      });
      if (error) throw new Error('audit_failed');
    },
  };
}

export default { fetch: (request: Request) => createQueryAuditHandler(createGateway())(request) };
