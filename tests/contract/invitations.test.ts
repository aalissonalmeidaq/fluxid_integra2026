// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createInviteUserHandler, type InvitationGateway } from '../../supabase/functions/invite-user/handler';

const ACTOR='10000000-0000-0000-0000-000000000002', TENANT='20000000-0000-0000-0000-00000000000a', ROLE='50000000-0000-0000-0000-000000000003';
const request=(body:unknown)=>new Request('http://local/invite-user',{method:'POST',headers:{authorization:'Bearer jwt','content-type':'application/json'},body:JSON.stringify(body)});
const gateway=(overrides:Partial<InvitationGateway>={}):InvitationGateway=>({
  authenticate:vi.fn(async()=>({userId:ACTOR,sessionId:'60000000-0000-0000-0000-000000000001',aal:'aal2' as const})),
  authorize:vi.fn(async()=>true),
  reserve:vi.fn(async()=>({kind:'reserved' as const,id:'70000000-0000-0000-0000-000000000001',expiresAt:'2026-10-03T12:00:00Z'})),
  deliver:vi.fn(async()=>({authInviteId:'auth-opaco'})),
  markDelivery:vi.fn(async()=>undefined),
  accept:vi.fn(async()=>({kind:'accepted' as const,membershipId:'30000000-0000-0000-0000-000000000099'})),
  audit:vi.fn(async()=>undefined),...overrides,
});
const call=async(gw:InvitationGateway,body:unknown)=>{const response=await createInviteUserHandler(gw)(request(body));return {status:response.status,body:await response.json()};};

describe('invite-user',()=>{
  it('reserva por 72 horas, envia no servidor e persiste o estado real de entrega',async()=>{
    const gw=gateway();const result=await call(gw,{operation:'invite',organization_id:TENANT,email:'Pessoa@Example.Invalid',role_id:ROLE,justification:'Novo integrante aprovado'});
    expect(result.status).toBe(202);expect(result.body).toMatchObject({code:'INVITATION_SENT',status:'sent'});
    expect(gw.reserve).toHaveBeenCalledWith(expect.objectContaining({email:'pessoa@example.invalid',resend:false}));
    expect(gw.markDelivery).toHaveBeenCalledWith(expect.objectContaining({status:'sent',authInviteId:'auth-opaco'}));
  });
  it.each([
    ['conflict','INVITATION_CONFLICT',409],['delivery_pending','DELIVERY_PENDING',429],['expired','INVITATION_EXPIRED',410],
  ] as const)('mapeia %s sem revelar conta ou detalhe interno',async(kind,code,status)=>{
    const gw=gateway({reserve:vi.fn(async()=>({kind} as const))});const result=await call(gw,{operation:'resend',organization_id:TENANT,email:'pessoa@example.invalid',role_id:ROLE,justification:'Reenvio solicitado pelo responsável'});
    expect(result).toEqual({status,body:{code}});expect(gw.deliver).not.toHaveBeenCalled();
  });
  it('marca delivery_failed sem transformar falha SMTP em sucesso',async()=>{
    const gw=gateway({deliver:vi.fn(async()=>{throw new Error('smtp detail');})});const result=await call(gw,{operation:'invite',organization_id:TENANT,email:'pessoa@example.invalid',role_id:ROLE,justification:'Novo integrante aprovado'});
    expect(result).toEqual({status:503,body:{code:'SERVICE_UNAVAILABLE'}});expect(gw.markDelivery).toHaveBeenCalledWith(expect.objectContaining({status:'delivery_failed'}));expect(JSON.stringify(result)).not.toContain('smtp');
  });
  it('aceita uma única vez apenas para o destinatário autenticado',async()=>{
    const gw=gateway();const result=await call(gw,{operation:'accept',invitation_id:'70000000-0000-0000-0000-000000000001'});
    expect(result.status).toBe(200);expect(gw.accept).toHaveBeenCalledWith(expect.objectContaining({actorId:ACTOR}));
  });
  it('nega ator sem permissão antes de reservar ou entregar',async()=>{
    const gw=gateway({authorize:vi.fn(async()=>false)});const result=await call(gw,{operation:'invite',organization_id:TENANT,email:'pessoa@example.invalid',role_id:ROLE,justification:'Novo integrante aprovado'});
    expect(result).toEqual({status:403,body:{code:'ACCESS_DENIED'}});expect(gw.reserve).not.toHaveBeenCalled();
  });
});
