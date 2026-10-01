import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createManageAccessHandler, type AccessGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => {
  const value = (globalThis as RuntimeEnvironment).Deno?.env.get(name);
  if (!value) throw new Error('server_configuration_error');
  return value;
};

function createGateway(): AccessGateway {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error('rpc_failed');
    return data as T;
  };
  return {
    async authenticate(token) {
      const { data, error } = await admin.auth.getUser(token);
      const claims = decodeClaims(token);
      if (error || !data.user || !claims.session_id) return null;
      return { userId: data.user.id, sessionId: claims.session_id, aal: claims.aal === 'aal2' ? 'aal2' : 'aal1' };
    },
    list: (input) => rpc('list_tenant_access', { p_actor: input.actorId, p_session: input.sessionId, p_organization: input.organizationId }),
    saveRole: (input) => rpc('save_tenant_role', {
      p_actor: input.actorId, p_session: input.sessionId, p_organization: input.organizationId, p_role: input.roleId ?? null,
      p_name: input.name, p_description: input.description, p_permissions: input.permissions,
      p_expected_version: input.expectedVersion ?? null, p_justification: input.justification,
    }),
    setRoleActive: (input) => rpc('set_tenant_role_active', {
      p_actor: input.actorId, p_session: input.sessionId, p_organization: input.organizationId, p_role: input.roleId,
      p_active: input.active, p_expected_version: input.expectedVersion, p_justification: input.justification,
    }),
    changeAssignment: (input) => rpc('change_tenant_role_assignment', {
      p_actor: input.actorId, p_session: input.sessionId, p_organization: input.organizationId, p_membership: input.membershipId,
      p_role: input.roleId, p_assign: input.assign, p_justification: input.justification,
    }),
    // Sucesso é auditado na mesma transação das RPCs; negações e falhas entram aqui, sem justificativa livre.
    async audit(event) {
      if (event.result === 'success') return;
      const { error } = await admin.from('audit_logs').insert({
        organization_id: event.organizationId ?? null, actor_user_id: event.actorId, action: event.action,
        target_type: 'role', result: event.result, reason_code: event.reason ?? null, metadata: {},
      });
      if (error) throw new Error('audit_failed');
    },
  };
}

export default { fetch: (request: Request) => createManageAccessHandler(createGateway())(request) };
