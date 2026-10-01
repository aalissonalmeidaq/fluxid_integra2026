export interface MembershipTransport{call(endpoint:'invite-user'|'manage-membership',body:Record<string,unknown>):Promise<{status:number;body:unknown}>}
export type MembershipOutcome<T=unknown>={kind:'success';value:T}|{kind:'access_denied'|'mfa_required'|'last_admin'|'conflict'|'delivery_pending'|'expired'|'invalid'|'unavailable'};
type Body={code?:unknown;invitation_id?:unknown;status?:unknown;membership?:unknown};

export interface MemberSummary{id:string;display_name:string;email:string;status:string;version:number}
export interface RoleOption{id:string;name:string}
const isMember=(value:unknown):value is MemberSummary=>{if(!value||typeof value!=='object')return false;const item=value as Record<string,unknown>;return typeof item.id==='string'&&typeof item.display_name==='string'&&typeof item.email==='string'&&typeof item.status==='string'&&typeof item.version==='number';};
const isRole=(value:unknown):value is RoleOption=>{if(!value||typeof value!=='object')return false;const item=value as Record<string,unknown>;return typeof item.id==='string'&&typeof item.name==='string';};

type InvitationInput={organizationId:string;email:string;roleId:string;justification:string};
const invitationSummary=(body:Body)=>typeof body.invitation_id==='string'&&typeof body.status==='string'?{id:body.invitation_id,status:body.status}:undefined;
const asBody=(value:unknown):Body=>(value&&typeof value==='object'?value:{}) as Body;

export class MembershipService{
  constructor(private readonly transport:MembershipTransport){}

  // Único ponto que fala com o transporte: falha de rede nunca vira sucesso nem exceção para a interface.
  private async run<T>(endpoint:'invite-user'|'manage-membership',payload:Record<string,unknown>,pick:(body:Body)=>T|undefined):Promise<MembershipOutcome<T>>{
    try{
      const response=await this.transport.call(endpoint,payload);
      const value=pick(asBody(response.body));
      if(response.status>=200&&response.status<300&&value!==undefined)return{kind:'success',value};
      return this.failure(response.body);
    }catch{return{kind:'unavailable'};}
  }
  private failure(rawBody:unknown):{kind:Exclude<MembershipOutcome['kind'],'success'>}{
    const kinds:Record<string,Exclude<MembershipOutcome['kind'],'success'>>={ACCESS_DENIED:'access_denied',MFA_REQUIRED:'mfa_required',LAST_ADMIN_REQUIRED:'last_admin',INVITATION_CONFLICT:'conflict',MEMBERSHIP_UNAVAILABLE:'conflict',DELIVERY_PENDING:'delivery_pending',INVITATION_EXPIRED:'expired',VALIDATION_FAILED:'invalid'};
    const code=asBody(rawBody).code;
    return{kind:(typeof code==='string'?kinds[code]:undefined)??'unavailable'};
  }

  list(input:{organizationId:string}):Promise<MembershipOutcome<{members:MemberSummary[];roles:RoleOption[]}>>{
    return this.run('manage-membership',{operation:'list',organization_id:input.organizationId},(body)=>{
      const raw=body as {members?:unknown;roles?:unknown};
      return Array.isArray(raw.members)?{members:raw.members.filter(isMember),roles:Array.isArray(raw.roles)?raw.roles.filter(isRole):[]}:undefined;
    });
  }
  private send(operation:'invite'|'resend',input:InvitationInput){
    return this.run('invite-user',{operation,organization_id:input.organizationId,email:input.email.trim().toLowerCase(),role_id:input.roleId,justification:input.justification},invitationSummary);
  }
  invite(input:InvitationInput){return this.send('invite',input);}
  resend(input:InvitationInput){return this.send('resend',input);}
  changeStatus(input:{organizationId:string;membershipId:string;status:'active'|'blocked'|'inactive';expectedVersion:number;justification:string}){
    return this.run('manage-membership',{organization_id:input.organizationId,membership_id:input.membershipId,status:input.status,expected_version:input.expectedVersion,justification:input.justification},(body)=>body.membership);
  }
}