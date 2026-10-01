import { describe,expect,it,vi } from 'vitest';
import { OrganizationService } from './organization-service';

describe('OrganizationService',()=>{
  it('não concede sucesso quando o servidor nega ou fica indisponível',async()=>{
    const call=vi.fn().mockResolvedValueOnce({status:403,body:{code:'ACCESS_DENIED'}}).mockRejectedValueOnce(new Error('offline'));
    const service=new OrganizationService({call});
    await expect(service.list()).resolves.toEqual({kind:'access_denied'});
    await expect(service.list()).resolves.toEqual({kind:'unavailable'});
  });
  it('cria tenant sem enviar estado inicial: o servidor define inactive',async()=>{
    const call=vi.fn(async()=>({status:201,body:{code:'ORGANIZATION_CREATED',organization:{id:'20000000-0000-0000-0000-000000000099',status:'inactive',version:1}}}));
    const service=new OrganizationService({call});
    await service.create({legalName:'Empresa Nova Ltda.',displayName:'Empresa Nova',justification:'Contrato aprovado'});
    expect(call).toHaveBeenCalledWith({operation:'create',legal_name:'Empresa Nova Ltda.',display_name:'Empresa Nova',justification:'Contrato aprovado'});
  });
  it('mapeia a recusa de ativação sem administrador ativo',async()=>{
    const service=new OrganizationService({call:vi.fn(async()=>({status:409,body:{code:'LAST_ADMIN_REQUIRED'}}))});
    await expect(service.changeStatus({organizationId:'20000000-0000-0000-0000-000000000099',status:'active',expectedVersion:1,justification:'Ativação solicitada'})).resolves.toEqual({kind:'admin_required'});
  });
  it('propaga versão e justificativa na mudança de estado',async()=>{
    const call=vi.fn(async()=>({status:200,body:{code:'ORGANIZATION_STATUS_CHANGED',organization:{id:'20000000-0000-0000-0000-000000000099',status:'suspended',version:2}}}));
    const service=new OrganizationService({call});
    await service.changeStatus({organizationId:'20000000-0000-0000-0000-000000000099',status:'suspended',expectedVersion:1,justification:'Decisão administrativa'});
    expect(call).toHaveBeenCalledWith(expect.objectContaining({operation:'change_status',expected_version:1,justification:'Decisão administrativa'}));
  });
});
