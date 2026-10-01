export interface OrganizationTransport { call(body:Record<string,unknown>):Promise<{status:number;body:unknown}> }
export type OrganizationOutcome<T=unknown>={kind:'success';value:T}|{kind:'access_denied'}|{kind:'mfa_required'}|{kind:'conflict'}|{kind:'admin_required'}|{kind:'invalid'}|{kind:'unavailable'};
type ResponseBody={code?:unknown;organization?:unknown;organizations?:unknown};

export class OrganizationService{
  constructor(private readonly transport:OrganizationTransport){}
  private async execute<T>(body:Record<string,unknown>,field:'organization'|'organizations'):Promise<OrganizationOutcome<T>>{
    try{
      const response=await this.transport.call(body); const value=(response.body&&typeof response.body==='object'?response.body:{}) as ResponseBody;
      if(response.status>=200&&response.status<300&&value[field]!==undefined)return {kind:'success',value:value[field] as T};
      if(value.code==='ACCESS_DENIED'||value.code==='AUTH_REQUIRED')return {kind:'access_denied'};
      if(value.code==='MFA_REQUIRED')return {kind:'mfa_required'};
      if(value.code==='CONFLICT')return {kind:'conflict'};
      if(value.code==='LAST_ADMIN_REQUIRED')return {kind:'admin_required'};
      if(value.code==='INVALID_REQUEST')return {kind:'invalid'};
      return {kind:'unavailable'};
    }catch{return {kind:'unavailable'};}
  }
  list(){return this.execute<unknown[]>({operation:'list'},'organizations');}
  create(input:{legalName:string;displayName:string;justification:string}){return this.execute({operation:'create',legal_name:input.legalName,display_name:input.displayName,justification:input.justification},'organization');}
  changeStatus(input:{organizationId:string;status:'active'|'suspended'|'inactive';expectedVersion:number;justification:string}){return this.execute({operation:'change_status',organization_id:input.organizationId,status:input.status,expected_version:input.expectedVersion,justification:input.justification},'organization');}
}
