import { describe, expect, it, vi } from 'vitest';
import { PermissionsService } from './permissions-service';

const TENANT = '20000000-0000-0000-0000-00000000000a';

const serviceWith = (response: { status: number; body: unknown } | Error) => {
  const call = vi.fn(async () => { if (response instanceof Error) throw response; return response; });
  return { call, service: new PermissionsService({ call }) };
};

describe('PermissionsService.query', () => {
  it('envia só o tenant ativo e converte a resposta válida', async () => {
    const { service, call } = serviceWith({ status: 200, body: { code: 'PERMISSIONS_LISTED', tenant: ['tenant.manage'], global: ['platform.manage'] } });
    expect(await service.query(TENANT)).toEqual({ kind: 'success', value: { tenant: ['tenant.manage'], global: ['platform.manage'] } });
    expect(call).toHaveBeenCalledWith({ organization_id: TENANT });
  });

  it('sem tenant ativo não envia organization_id', async () => {
    const { service, call } = serviceWith({ status: 200, body: { code: 'PERMISSIONS_LISTED', tenant: [], global: [] } });
    expect(await service.query(null)).toEqual({ kind: 'success', value: { tenant: [], global: [] } });
    expect(call).toHaveBeenCalledWith({});
  });

  it('descarta códigos que não são texto', async () => {
    const { service } = serviceWith({ status: 200, body: { code: 'PERMISSIONS_LISTED', tenant: ['audit.read', 7, null, { x: 1 }], global: [true, 'platform.manage'] } });
    expect(await service.query(TENANT)).toEqual({ kind: 'success', value: { tenant: ['audit.read'], global: ['platform.manage'] } });
  });

  it.each([
    ['campo tenant ausente', { code: 'PERMISSIONS_LISTED', global: [] }],
    ['campo global ausente', { code: 'PERMISSIONS_LISTED', tenant: [] }],
    ['tenant com tipo errado', { code: 'PERMISSIONS_LISTED', tenant: 'tenant.manage', global: [] }],
    ['global com tipo errado', { code: 'PERMISSIONS_LISTED', tenant: [], global: { a: 1 } }],
    ['código inesperado', { code: 'OUTRA_COISA', tenant: ['tenant.manage'], global: [] }],
    ['corpo que não é objeto', 'ok'],
    ['corpo nulo', null],
  ])('resposta fora do contrato (%s) vira unavailable', async (_nome, body) => {
    const { service } = serviceWith({ status: 200, body });
    expect(await service.query(TENANT)).toEqual({ kind: 'unavailable' });
  });

  it('status inesperado vira unavailable, mesmo com corpo parecido com sucesso', async () => {
    const { service } = serviceWith({ status: 500, body: { code: 'PERMISSIONS_LISTED', tenant: ['tenant.manage'], global: [] } });
    expect(await service.query(TENANT)).toEqual({ kind: 'unavailable' });
  });

  it('401 vira unavailable: a sessão é tratada pelo AuthProvider', async () => {
    const { service } = serviceWith({ status: 401, body: { code: 'AUTH_REQUIRED' } });
    expect(await service.query(TENANT)).toEqual({ kind: 'unavailable' });
  });

  it('exceção do transporte vira unavailable', async () => {
    const { service } = serviceWith(new Error('rede'));
    expect(await service.query(TENANT)).toEqual({ kind: 'unavailable' });
  });
});
