import { json, preflight, UUID_PATTERN } from '../_shared/http.ts';

type Identity={userId:string;sessionId:string;aal:'aal1'|'aal2'};
type ReserveResult={kind:'reserved';id:string;expiresAt:string}|{kind:'conflict'}|{kind:'delivery_pending'}|{kind:'expired'};
type AcceptResult={kind:'accepted';membershipId:string}|{kind:'conflict'}|{kind:'expired'};
export interface InvitationGateway{
  authenticate(token:string):Promise<Identity|null>;
  authorize(input:{actorId:string;sessionId:string;organizationId:string}):Promise<boolean>;
  reserve(input:{actorId:string;sessionId:string;organizationId:string;email:string;roleId:string;justification:string;resend:boolean}):Promise<ReserveResult>;
  deliver(input:{email:string;invitationId:string}):Promise<{authInviteId:string}>;
  markDelivery(input:{invitationId:string;status:'sent'|'delivery_failed';authInviteId?:string}):Promise<void>;
  accept(input:{actorId:string;sessionId:string;invitationId:string}):Promise<AcceptResult>;
  audit(event:{actorId:string;organizationId?:string;action:string;result:'success'|'denied'|'failed';reason?:string;targetId?:string;justification?:string}):Promise<void>;
}
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const bearer=(request:Request)=>request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]??null;
const mapReserve=(kind:Exclude<ReserveResult['kind'],'reserved'>)=>kind==='delivery_pending'?json({code:'DELIVERY_PENDING'},429):kind==='expired'?json({code:'INVITATION_EXPIRED'},410):json({code:'INVITATION_CONFLICT'},409);

export function createInviteUserHandler(gateway:InvitationGateway){return async(request:Request):Promise<Response>=>{
  if(request.method==='OPTIONS')return preflight();if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
  const token=bearer(request);if(!token)return json({code:'AUTH_REQUIRED'},401);
  const identity=await gateway.authenticate(token).catch(()=>null);if(!identity)return json({code:'AUTH_REQUIRED'},401);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;if(!body||typeof body.operation!=='string')return json({code:'VALIDATION_FAILED'},400);
  if(body.operation==='accept'){
    if(typeof body.invitation_id!=='string'||!UUID_PATTERN.test(body.invitation_id))return json({code:'VALIDATION_FAILED'},400);
    const outcome=await gateway.accept({actorId:identity.userId,sessionId:identity.sessionId,invitationId:body.invitation_id});
    if(outcome.kind==='expired')return json({code:'INVITATION_EXPIRED'},410);if(outcome.kind==='conflict')return json({code:'INVITATION_CONFLICT'},409);
    return json({code:'INVITATION_ACCEPTED',membership_id:outcome.membershipId});
  }
  if(body.operation!=='invite'&&body.operation!=='resend')return json({code:'VALIDATION_FAILED'},400);
  const organizationId=typeof body.organization_id==='string'?body.organization_id:'',roleId=typeof body.role_id==='string'?body.role_id:'',email=typeof body.email==='string'?body.email.trim().toLowerCase():'',justification=typeof body.justification==='string'?body.justification.trim():'';
  if(!UUID_PATTERN.test(organizationId)||!UUID_PATTERN.test(roleId)||!EMAIL.test(email)||email.length>254||justification.length<10||justification.length>500)return json({code:'VALIDATION_FAILED'},400);
  if(identity.aal!=='aal2')return json({code:'MFA_REQUIRED'},403);
  if(!await gateway.authorize({actorId:identity.userId,sessionId:identity.sessionId,organizationId})){
    // Não grava o tenant solicitado: pode ser sondagem entre tenants e apareceria na auditoria do tenant sondado (AUD-005).
    await gateway.audit({actorId:identity.userId,action:'invitation.send',result:'denied',reason:'permission_denied'});return json({code:'ACCESS_DENIED'},403);
  }
  const reserved=await gateway.reserve({actorId:identity.userId,sessionId:identity.sessionId,organizationId,email,roleId,justification,resend:body.operation==='resend'});
  if(reserved.kind!=='reserved')return mapReserve(reserved.kind);
  try{const delivery=await gateway.deliver({email,invitationId:reserved.id});await gateway.markDelivery({invitationId:reserved.id,status:'sent',authInviteId:delivery.authInviteId});return json({code:'INVITATION_SENT',invitation_id:reserved.id,status:'sent',expires_at:reserved.expiresAt},202);}
  catch{await gateway.markDelivery({invitationId:reserved.id,status:'delivery_failed'});await gateway.audit({actorId:identity.userId,organizationId,action:'invitation.send',result:'failed',reason:'delivery_failed',targetId:reserved.id});return json({code:'SERVICE_UNAVAILABLE'},503);}
};}
