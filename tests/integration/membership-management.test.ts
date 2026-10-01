// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageMembershipHandler, type MembershipGateway } from '../../supabase/functions/manage-membership/handler';

const TENANT_A='20000000-0000-0000-0000-00000000000a', MEMBER='30000000-0000-0000-0000-000000000099';
const listed={kind:'listed' as const,members:[{id:MEMBER,display_name:'Operador A',email:'operador-a@example.invalid',status:'active',version:1}],roles:[{id:'50000000-0000-0000-0000-000000000004',name:'Operador técnico'}]};
const gateway=(overrides:Partial<MembershipGateway>={}):MembershipGateway=>({authenticate:vi.fn(async()=>({userId:'10000000-0000-0000-0000-000000000002',sessionId:'60000000-0000-0000-0000-000000000001',aal:'aal2' as const})),list:vi.fn(async()=>listed),changeStatus:vi.fn(async(input)=>({kind:'changed' as const,membership:{id:input.membershipId,organization_id:input.organizationId,status:input.status,version:2}})),audit:vi.fn(async()=>undefined),...overrides});
const call=async(gw:MembershipGateway,body:unknown)=>{const response=await createManageMembershipHandler(gw)(new Request('http://local/manage-membership',{method:'POST',headers:{authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};

describe('manage-membership: auditoria de negações',()=>{
  const change={organization_id:TENANT_A,membership_id:MEMBER,status:'blocked',expected_version:1,justification:'Alteração aprovada pelo administrador'};
  it('audita negação por permissão sem gravar o alvo nem o tenant solicitado',async()=>{const gw=gateway({changeStatus:vi.fn(async()=>({kind:'access_denied' as const}))});await call(gw,change);expect(gw.audit).toHaveBeenCalledTimes(1);expect(gw.audit).toHaveBeenCalledWith({actorId:'10000000-0000-0000-0000-000000000002',action:'membership.status.change',result:'denied',reason:'permission_denied'});});
  it('audita a falta de MFA e não executa a mutação',async()=>{const gw=gateway({authenticate:vi.fn(async()=>({userId:'10000000-0000-0000-0000-000000000002',sessionId:'60000000-0000-0000-0000-000000000001',aal:'aal1' as const}))});expect((await call(gw,change)).body).toEqual({code:'MFA_REQUIRED'});expect(gw.changeStatus).not.toHaveBeenCalled();expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({result:'denied',reason:'mfa_required'}));});
  it('audita acesso cruzado na listagem sem revelar dados',async()=>{const gw=gateway({list:vi.fn(async()=>({kind:'access_denied' as const}))});await call(gw,{operation:'list',organization_id:'20000000-0000-0000-0000-00000000000b'});expect(gw.audit).toHaveBeenCalledWith({actorId:'10000000-0000-0000-0000-000000000002',action:'membership.list',result:'denied',reason:'permission_denied'});});
  it('não audita negação quando a operação é permitida',async()=>{const gw=gateway();await call(gw,change);expect(gw.audit).not.toHaveBeenCalledWith(expect.objectContaining({result:'denied'}));});
});

describe('manage-membership: listagem',()=>{
  it('lista vínculos e papéis do tenant solicitado sem exigir MFA de leitura',async()=>{const gw=gateway({authenticate:vi.fn(async()=>({userId:'10000000-0000-0000-0000-000000000002',sessionId:'60000000-0000-0000-0000-000000000001',aal:'aal1' as const}))});const result=await call(gw,{operation:'list',organization_id:TENANT_A});expect(result.status).toBe(200);expect(result.body).toEqual({code:'MEMBERS_LISTED',members:listed.members,roles:listed.roles});expect(gw.list).toHaveBeenCalledWith(expect.objectContaining({organizationId:TENANT_A}));});
  it('nega tenant não autorizado sem revelar dados',async()=>{const gw=gateway({list:vi.fn(async()=>({kind:'access_denied' as const}))});expect(await call(gw,{operation:'list',organization_id:'20000000-0000-0000-0000-00000000000b'})).toEqual({status:403,body:{code:'ACCESS_DENIED'}});});
  it('rejeita organização inválida antes do gateway',async()=>{const gw=gateway();expect(await call(gw,{operation:'list',organization_id:'nao-e-uuid'})).toEqual({status:400,body:{code:'VALIDATION_FAILED'}});expect(gw.list).not.toHaveBeenCalled();});
  it('exige sessão autenticada',async()=>{const gw=gateway({authenticate:vi.fn(async()=>null)});expect((await call(gw,{operation:'list',organization_id:TENANT_A})).status).toBe(401);expect(gw.list).not.toHaveBeenCalled();});
});

describe('manage-membership',()=>{
  it.each(['blocked','inactive','active'] as const)('altera vínculo para %s somente no tenant solicitado',async(status)=>{const gw=gateway();const result=await call(gw,{organization_id:TENANT_A,membership_id:MEMBER,status,expected_version:1,justification:'Alteração aprovada pelo administrador'});expect(result.status).toBe(200);expect(gw.changeStatus).toHaveBeenCalledWith(expect.objectContaining({organizationId:TENANT_A,membershipId:MEMBER,status}));});
  it.each([['last_admin','LAST_ADMIN_REQUIRED',409],['access_denied','ACCESS_DENIED',403],['conflict','MEMBERSHIP_UNAVAILABLE',409]] as const)('preserva invariantes quando retorna %s',async(kind,code,status)=>{const gw=gateway({changeStatus:vi.fn(async()=>({kind} as const))});expect(await call(gw,{organization_id:TENANT_A,membership_id:MEMBER,status:'inactive',expected_version:1,justification:'Alteração aprovada pelo administrador'})).toEqual({status,body:{code}});});
});
