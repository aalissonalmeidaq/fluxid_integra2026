// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createManageRegistryHandler } from '../../supabase/functions/manage-registry/handler';
import { createQueryRegistryHandler } from '../../supabase/functions/query-registry/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 007, US6: operações de inativação, reativação e prévia nas duas funções (RF-033 a RF-035, CA-010). O banco é sempre falso.

const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const ID = '81000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown>): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const manage = (gw: Gateway) => createManageRegistryHandler(gw);

describe('inativação e reativação', () => {
  it('inativar cliente entrega justificativa e as quantidades esperadas ao banco', async () => {
    const gw = gateway({ code: 'INACTIVATED', version: 4, sites: 2, geofences: 3 });
    const response = await manage(gw)(post({ operation: 'inactivate_customer', organization_id: ORG, customer_id: ID, justification: 'Contrato encerrado', expected_counts: { sites: 2, geofences: 3 } }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('inactivate_customer', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_customer: ID, p_justification: 'Contrato encerrado', p_expected_counts: { sites: 2, geofences: 3 },
    });
  });

  it.each([
    ['sem as quantidades esperadas', { expected_counts: undefined }],
    ['quantidade negativa', { expected_counts: { sites: -1, geofences: 0 } }],
    ['quantidade decimal', { expected_counts: { sites: 1.5, geofences: 0 } }],
    ['quantidade que falta', { expected_counts: { sites: 1 } }],
    ['sem justificativa', { justification: undefined }],
    ['justificativa de mais de 500 caracteres', { justification: 'x'.repeat(501) }],
  ])('inativar cliente %s é recusado antes do banco', async (_nome, extra) => {
    const gw = gateway({ code: 'INACTIVATED' });
    const response = await manage(gw)(post({ operation: 'inactivate_customer', organization_id: ORG, customer_id: ID, justification: 'Contrato encerrado', expected_counts: { sites: 0, geofences: 0 }, ...extra }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('as demais operações do ciclo de vida existem e usam os argumentos certos', async () => {
    const cases: Array<[string, string, Record<string, unknown>, string]> = [
      ['reactivate_customer', 'customer_id', {}, 'p_customer'],
      ['inactivate_site', 'site_id', { expected_counts: { geofences: 2 } }, 'p_site'],
      ['reactivate_site', 'site_id', {}, 'p_site'],
      ['inactivate_geofence', 'geofence_id', {}, 'p_geofence'],
      ['reactivate_geofence', 'geofence_id', {}, 'p_geofence'],
      ['inactivate_driver', 'driver_id', {}, 'p_driver'],
      ['reactivate_driver', 'driver_id', {}, 'p_driver'],
    ];
    for (const [operation, field, extra, arg] of cases) {
      const gw = gateway({ code: operation.startsWith('re') ? 'REACTIVATED' : 'INACTIVATED' });
      expect((await manage(gw)(post({ operation, organization_id: ORG, [field]: ID, justification: 'Motivo claro', ...extra }))).status, operation).toBe(200);
      expect(gw.rpc.mock.calls[0]?.[0]).toBe(operation);
      expect(gw.rpc.mock.calls[0]?.[1]).toMatchObject({ [arg]: ID, p_justification: 'Motivo claro' });
    }
  });

  it('CASCADE_CHANGED volta 409 com as quantidades atuais; ALREADY_INACTIVE e PARENT_INACTIVE também são 409', async () => {
    const changed = await manage(gateway({ code: 'CASCADE_CHANGED', counts: { sites: 3, geofences: 5 } }))(post({ operation: 'inactivate_customer', organization_id: ORG, customer_id: ID, justification: 'Motivo claro', expected_counts: { sites: 1, geofences: 1 } }));
    expect(changed.status).toBe(409);
    expect(await changed.json()).toEqual({ code: 'CASCADE_CHANGED', counts: { sites: 3, geofences: 5 } });
    expect((await manage(gateway({ code: 'ALREADY_INACTIVE' }))(post({ operation: 'inactivate_geofence', organization_id: ORG, geofence_id: ID, justification: 'Motivo claro' }))).status).toBe(409);
    expect((await manage(gateway({ code: 'PARENT_INACTIVE' }))(post({ operation: 'reactivate_site', organization_id: ORG, site_id: ID, justification: 'Motivo claro' }))).status).toBe(409);
  });

  it('negação de permissão é auditada e devolve 403', async () => {
    const gw = gateway({ code: 'ACCESS_DENIED' });
    expect((await manage(gw)(post({ operation: 'inactivate_driver', organization_id: ORG, driver_id: ID, justification: 'Motivo claro' }))).status).toBe(403);
    expect(gw.audit).toHaveBeenCalledWith({ actorId: USER, action: 'driver.inactivate', result: 'denied', reason: 'permission_denied' });
  });
});

describe('prévia da cascata', () => {
  it('as duas prévias são consultas somente leitura que exigem UUID', async () => {
    const gw = gateway({ code: 'FOUND', sites: 1, geofences: 2 });
    const query = createQueryRegistryHandler(gw);
    expect((await query(post({ operation: 'preview_customer_inactivation', organization_id: ORG, customer_id: ID }))).status).toBe(200);
    expect((await query(post({ operation: 'preview_site_inactivation', organization_id: ORG, site_id: ID }))).status).toBe(200);
    expect((await query(post({ operation: 'preview_site_inactivation', organization_id: ORG, site_id: 'x' }))).status).toBe(400);
    expect(gw.rpc.mock.calls.map((call) => call[0])).toEqual(['preview_customer_inactivation', 'preview_site_inactivation']);
  });
});
