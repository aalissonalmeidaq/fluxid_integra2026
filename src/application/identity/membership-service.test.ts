import { describe, expect, it, vi } from 'vitest';
import { MembershipService } from './membership-service';

describe('MembershipService: listagem',()=>{
  it('lista vínculos e papéis do tenant e ignora entradas malformadas',async()=>{const call=vi.fn(async()=>({status:200,body:{code:'MEMBERS_LISTED',members:[{id:'m1',display_name:'Ana',email:'ana@example.invalid',status:'active',version:1},{id:7}],roles:[{id:'r1',name:'Operador técnico'},null]}}));const service=new MembershipService({call});expect(await service.list({organizationId:'org-a'})).toEqual({kind:'success',value:{members:[{id:'m1',display_name:'Ana',email:'ana@example.invalid',status:'active',version:1}],roles:[{id:'r1',name:'Operador técnico'}]}});expect(call).toHaveBeenCalledWith('manage-membership',{operation:'list',organization_id:'org-a'});});
  it('não concede sucesso quando o servidor nega ou falha',async()=>{const service=new MembershipService({call:vi.fn().mockResolvedValueOnce({status:403,body:{code:'ACCESS_DENIED'}}).mockRejectedValueOnce(new Error('offline'))});expect(await service.list({organizationId:'org-a'})).toEqual({kind:'access_denied'});expect(await service.list({organizationId:'org-a'})).toEqual({kind:'unavailable'});});
});

describe('MembershipService: falha de transporte',()=>{
  const input={organizationId:'org-a',email:'ana@example.invalid',roleId:'role-a',justification:'Convite aprovado'};
  it('converte exceção de rede em indisponível em vez de propagar ou simular sucesso',async()=>{
    const service=new MembershipService({call:vi.fn(async()=>{throw new Error('offline');})});
    expect(await service.invite(input)).toEqual({kind:'unavailable'});
    expect(await service.resend(input)).toEqual({kind:'unavailable'});
    expect(await service.changeStatus({organizationId:'org-a',membershipId:'m1',status:'blocked',expectedVersion:1,justification:'Alteração aprovada'})).toEqual({kind:'unavailable'});
  });
  it('reenvio usa a operação resend com e-mail normalizado',async()=>{
    const call=vi.fn(async()=>({status:202,body:{code:'INVITATION_SENT',invitation_id:'inv-2',status:'sent'}}));
    expect(await new MembershipService({call}).resend({...input,email:' Ana@Example.Invalid '})).toEqual({kind:'success',value:{id:'inv-2',status:'sent'}});
    expect(call).toHaveBeenCalledWith('invite-user',expect.objectContaining({operation:'resend',email:'ana@example.invalid'}));
  });
});

describe('MembershipService',()=>{
  it('normaliza o contrato de convite e não faz fallback em negação',async()=>{const call=vi.fn(async()=>({status:202,body:{code:'INVITATION_SENT',invitation_id:'convite-1',status:'sent'}}));const service=new MembershipService({call});expect(await service.invite({organizationId:'org-a',email:'Pessoa@Example.Invalid',roleId:'role-a',justification:'Convite aprovado'})).toEqual({kind:'success',value:{id:'convite-1',status:'sent'}});expect(call).toHaveBeenCalledWith('invite-user',expect.objectContaining({email:'pessoa@example.invalid'}));});
  it.each([[403,'ACCESS_DENIED','access_denied'],[403,'MFA_REQUIRED','mfa_required'],[409,'LAST_ADMIN_REQUIRED','last_admin'],[409,'INVITATION_CONFLICT','conflict'],[429,'DELIVERY_PENDING','delivery_pending'],[503,'SERVICE_UNAVAILABLE','unavailable']] as const)('mapeia %s/%s para %s',async(status,code,kind)=>{const service=new MembershipService({call:vi.fn(async()=>({status,body:{code}}))});expect((await service.changeStatus({organizationId:'org-a',membershipId:'member-a',status:'inactive',expectedVersion:1,justification:'Alteração aprovada'})).kind).toBe(kind);});
});
