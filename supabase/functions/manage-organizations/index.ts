import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createManageOrganizationsHandler, type GlobalIdentity, type OrganizationGateway } from './handler.ts';

interface RuntimeEnvironment { Deno?: { env: { get(name: string): string | undefined } } }
const env = (name: string) => { const value=(globalThis as RuntimeEnvironment).Deno?.env.get(name); if(!value) throw new Error('server_configuration_error'); return value; };
const options={auth:{persistSession:false,autoRefreshToken:false}} as const;

function createGateway(): OrganizationGateway {
  const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),options);
  let current: { userId:string; sessionId:string } | null=null;
  const rpc=async <T>(name:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await admin.rpc(name,args);if(error)throw new Error('rpc_failed');return data as T;};
  const args=()=>{if(!current)throw new Error('identity_missing');return {p_actor:current.userId,p_session:current.sessionId};};
  return {
    async authenticate(token):Promise<GlobalIdentity|null>{
      const {data,error}=await admin.auth.getUser(token); const claims=decodeClaims(token);
      if(error||!data.user||!claims.session_id)return null;
      current={userId:data.user.id,sessionId:claims.session_id};
      const context=await rpc<{session_active:boolean;can_manage_platform:boolean;can_manage_master:boolean}>('global_actor_context',args());
      return {userId:data.user.id,aal:claims.aal==='aal2'?'aal2':'aal1',sessionActive:context.session_active,canManagePlatform:context.can_manage_platform,canManageMaster:context.can_manage_master};
    },
    list:()=>rpc('list_managed_organizations',args()),
    create:(input)=>rpc('create_managed_organization',{...args(),p_legal_name:input.legalName,p_display_name:input.displayName,p_status:'inactive',p_justification:input.justification}),
    changeStatus:(input)=>rpc('change_managed_organization_status',{...args(),p_organization:input.organizationId,p_status:input.status,p_expected_version:input.expectedVersion,p_justification:input.justification}),
    async inviteFirstAdmin(input){const id=await rpc<string>('invite_first_tenant_admin',{...args(),p_organization:input.organizationId,p_email:input.email,p_justification:input.justification});return {invitationId:id};},
    async audit(event){
      if(event.result==='success')return;
      const {error}=await (admin as SupabaseClient).from('audit_logs').insert({actor_user_id:event.actorId??null,action:event.action,target_type:'organization',target_id:event.targetId??null,result:event.result,reason_code:event.reason??null,justification:event.justification??null,metadata:{}});
      if(error)throw new Error('audit_failed');
    },
  };
}
export default {fetch:(request:Request):Promise<Response>=>createManageOrganizationsHandler(createGateway())(request)};
