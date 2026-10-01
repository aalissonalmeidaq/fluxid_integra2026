import { createClient } from '@supabase/supabase-js';
import { decodeClaims } from '../_shared/http.ts';
import { createInviteUserHandler, type InvitationGateway } from './handler.ts';

interface RuntimeEnvironment{Deno?:{env:{get(name:string):string|undefined}}}
const env=(name:string)=>{const value=(globalThis as RuntimeEnvironment).Deno?.env.get(name);if(!value)throw new Error('server_configuration_error');return value;};
function createGateway():InvitationGateway{
  const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async<T>(name:string,args:Record<string,unknown>):Promise<T>=>{const {data,error}=await admin.rpc(name,args);if(error)throw new Error('rpc_failed');return data as T;};
  return {
    async authenticate(token){const {data,error}=await admin.auth.getUser(token);const claims=decodeClaims(token);if(error||!data.user||!claims.session_id)return null;return {userId:data.user.id,sessionId:claims.session_id,aal:claims.aal==='aal2'?'aal2':'aal1'};},
    authorize:({actorId,sessionId,organizationId})=>rpc('tenant_actor_authorized',{p_actor:actorId,p_session:sessionId,p_organization:organizationId}),
    async reserve(input){const result=await rpc<Record<string,unknown>>('reserve_tenant_invitation',{p_actor:input.actorId,p_session:input.sessionId,p_organization:input.organizationId,p_email:input.email,p_role:input.roleId,p_justification:input.justification,p_resend:input.resend});if(result.kind==='reserved')return {kind:'reserved',id:String(result.id),expiresAt:String(result.expires_at)};return {kind:(result.kind==='delivery_pending'||result.kind==='expired'?'delivery_pending':'conflict')};},
    async deliver(input){const redirectTo=(globalThis as RuntimeEnvironment).Deno?.env.get('INVITATION_REDIRECT_URL');const {data,error}=await admin.auth.admin.inviteUserByEmail(input.email,{data:{invitation_id:input.invitationId},...(redirectTo?{redirectTo}:{})});if(error||!data.user)throw new Error('delivery_failed');return {authInviteId:data.user.id};},
    markDelivery:async(input)=>{await rpc('mark_invitation_delivery',{p_invitation:input.invitationId,p_status:input.status,p_auth_invite_id:input.authInviteId??null});},
    async accept(input){const result=await rpc<Record<string,unknown>>('accept_tenant_invitation',{p_actor:input.actorId,p_session:input.sessionId,p_invitation:input.invitationId});if(result.kind==='accepted')return {kind:'accepted',membershipId:String(result.membership_id)};return {kind:result.kind==='expired'?'expired':'conflict'};},
    async audit(event){
      const {error}=await admin.from('audit_logs').insert({organization_id:event.organizationId??null,actor_user_id:event.actorId,action:event.action,target_type:'invitation',target_id:event.targetId??null,result:event.result,reason_code:event.reason??null,justification:event.justification??null,metadata:{}});
      if(error)throw new Error('audit_failed');
    },
  };
}
export default{fetch:(request:Request)=>createInviteUserHandler(createGateway())(request)};
