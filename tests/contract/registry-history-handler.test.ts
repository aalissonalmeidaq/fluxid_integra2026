// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createQueryRegistryHandler } from '../../supabase/functions/query-registry/handler';
import type { OperationsGateway } from '../../supabase/functions/_shared/operations';

// Spec 007, US7: a operação `history` (RF-036, RF-037). O banco é sempre falso.
const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000700a2';
const ORG = '20000000-0000-4000-8000-00000000000a';
const ID = '85000000-0000-4000-8000-000000000001';

type Gateway = OperationsGateway & { rpc: ReturnType<typeof vi.fn>; audit: ReturnType<typeof vi.fn> };
const gateway = (result: Record<string, unknown> = { code: 'LISTED', events: [], next: null }): Gateway => ({
  authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
  rpc: vi.fn(async () => result),
  audit: vi.fn(async () => undefined),
}) as never;
const post = (body: unknown) => new Request('http://local/fn', { method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('query-registry: history', () => {
  it('repassa o cadastro, os filtros, a ordem, o cursor e o limite', async () => {
    const gw = gateway();
    const response = await createQueryRegistryHandler(gw)(post({
      operation: 'history', organization_id: ORG, entity_type: 'vehicle', entity_id: ID, event_type: 'vehicle_status_changed', from: '2026-10-01', to: '2026-10-31', order: 'asc', cursor: '12', limit: 50,
    }));
    expect(response.status).toBe(200);
    expect(gw.rpc).toHaveBeenCalledWith('query_registry_history', {
      p_actor: USER, p_session: SESSION, p_organization: ORG, p_entity_type: 'vehicle', p_entity: ID, p_event_type: 'vehicle_status_changed', p_from: '2026-10-01', p_to: '2026-10-31',
      p_order: 'asc', p_cursor: '12', p_limit: 50,
    });
  });

  it.each([
    [{ entity_type: 'widget' }], [{ entity_id: 'x' }], [{ event_type: 'cylinder_created' }], [{ from: '2026-13-01' }], [{ order: 'sideways' }], [{ limit: 0 }], [{ limit: 101 }],
  ])('parâmetro fora do contrato %j é recusado antes do banco', async (extra) => {
    const gw = gateway();
    const response = await createQueryRegistryHandler(gw)(post({ operation: 'history', organization_id: ORG, entity_type: 'driver', entity_id: ID, ...extra }));
    expect(response.status).toBe(400);
    expect(gw.rpc).not.toHaveBeenCalled();
  });

  it('as cinco áreas são aceitas', async () => {
    for (const entity_type of ['customer', 'site', 'geofence', 'vehicle', 'driver']) {
      const gw = gateway();
      expect((await createQueryRegistryHandler(gw)(post({ operation: 'history', organization_id: ORG, entity_type, entity_id: ID }))).status, entity_type).toBe(200);
    }
  });

  it('negação por permissão da área é 403 e auditada; cadastro de outra organização é 404', async () => {
    const denied = gateway({ code: 'ACCESS_DENIED' });
    expect((await createQueryRegistryHandler(denied)(post({ operation: 'history', organization_id: ORG, entity_type: 'driver', entity_id: ID }))).status).toBe(403);
    expect(denied.audit).toHaveBeenCalledWith({ actorId: USER, action: 'registry.history', result: 'denied', reason: 'permission_denied' });
    expect((await createQueryRegistryHandler(gateway({ code: 'NOT_FOUND' }))(post({ operation: 'history', organization_id: ORG, entity_type: 'driver', entity_id: ID }))).status).toBe(404);
  });
});
