import { json, preflight, UUID_PATTERN } from '../_shared/http.ts';
type Status='active'|'blocked'|'inactive';
type Identity={userId:string;sessionId:string;aal:'aal1'|'aal2'};
type MemberSummary={id:string;display_name:string;email:string;status:string;version:number};
type ListResult={kind:'listed';members:MemberSummary[];roles:Array<{id:string;name:string}>}|{kind:'access_denied'};
type ChangeResult={kind:'changed';membership:{id:string;organization_id:string;status:Status;version:number}}|{kind:'last_admin'}|{kind:'access_denied'}|{kind:'conflict'};
export interface MembershipGateway{
  authenticate(token:string):Promise<Identity|null>;
  list(input:{actorId:string;sessionId:string;organizationId:string}):Promise<ListResult>;
  changeStatus(input:{actorId:string;sessionId:string;organizationId:string;membershipId:string;status:Status;expectedVersion:number;justification:string}):Promise<ChangeResult>;
  audit(event:{actorId:string;organizationId?:string;action:string;result:'success'|'denied'|'failed';reason?:string;targetId?:string;justification?:string}):Promise<void>;
}
const bearer=(request:Request)=>request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]??null;
const isStatus=(value:unknown):value is Status=>value==='active'||value==='blocked'||value==='inactive';
export function createManageMembershipHandler(gateway:MembershipGateway){return async(request:Request):Promise<Response>=>{
  if(request.method==='OPTIONS')return preflight();if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
  const token=bearer(request);if(!token)return json({code:'AUTH_REQUIRED'},401);const identity=await gateway.authenticate(token).catch(()=>null);if(!identity)return json({code:'AUTH_REQUIRED'},401);
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(body?.operation==='list'){
    if(typeof body.organization_id!=='string'||!UUID_PATTERN.test(body.organization_id))return json({code:'VALIDATION_FAILED'},400);
    const listed=await gateway.list({actorId:identity.userId,sessionId:identity.sessionId,organizationId:body.organization_id});
    if(listed.kind==='access_denied'){await gateway.audit({actorId:identity.userId,action:'membership.list',result:'denied',reason:'permission_denied'});return json({code:'ACCESS_DENIED'},403);}
    return json({code:'MEMBERS_LISTED',members:listed.members,roles:listed.roles});
  }
  const organizationId=body?.organization_id,membershipId=body?.membership_id,justification=typeof body?.justification==='string'?body.justification.trim():'';
  if(typeof organizationId!=='string'||!UUID_PATTERN.test(organizationId)||typeof membershipId!=='string'||!UUID_PATTERN.test(membershipId)||!isStatus(body?.status)||!Number.isSafeInteger(body?.expected_version)||Number(body?.expected_version)<1||justification.length<10||justification.length>500)return json({code:'VALIDATION_FAILED'},400);
  if(identity.aal!=='aal2'){await gateway.audit({actorId:identity.userId,action:'membership.status.change',result:'denied',reason:'mfa_required'});return json({code:'MFA_REQUIRED'},403);}
  const result=await gateway.changeStatus({actorId:identity.userId,sessionId:identity.sessionId,organizationId,membershipId,status:body.status,expectedVersion:Number(body.expected_version),justification});
  if(result.kind==='last_admin')return json({code:'LAST_ADMIN_REQUIRED'},409);if(result.kind==='access_denied'){await gateway.audit({actorId:identity.userId,action:'membership.status.change',result:'denied',reason:'permission_denied'});return json({code:'ACCESS_DENIED'},403);}if(result.kind==='conflict')return json({code:'MEMBERSHIP_UNAVAILABLE'},409);
  await gateway.audit({actorId:identity.userId,organizationId,action:'membership.status.change',result:'success',targetId:membershipId,justification});return json({code:'MEMBERSHIP_STATUS_CHANGED',membership:result.membership});
};}
