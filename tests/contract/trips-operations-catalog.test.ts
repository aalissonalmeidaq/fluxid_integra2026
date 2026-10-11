// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createOperationsHandler, type OperationsGateway } from '../../supabase/functions/_shared/operations';
import { EVENT_TYPES } from '../../supabase/functions/_shared/cylinders';
import { CYLINDER_TRIP_EVENT_TYPES } from '../../src/domain/trips/trip-vocabulary';

// Spec 008 (T023): o catálogo de operações ganha os códigos de viagem sem mudar o comportamento dos existentes.
const USER = '10000000-0000-4000-8000-000000000002';
const SESSION = '60000000-0000-4000-8000-0000000800a2';
const ORG = '20000000-0000-4000-8000-00000000000a';

const handlerFor = (result: Record<string, unknown>) => {
  const gateway: OperationsGateway = {
    authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
    rpc: vi.fn(async () => result),
    audit: vi.fn(async () => undefined),
  };
  const handler = createOperationsHandler(gateway, { do_it: { rpc: 'do_it', fields: {} } }, { prefix: 'trip' });
  const call = () => handler(new Request('http://local/fn', {
    method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'do_it', organization_id: ORG }),
  }));
  return { call, gateway };
};

describe('códigos de erro de viagem', () => {
  it.each([
    'CYLINDER_RESERVED', 'CYLINDER_NOT_ELIGIBLE', 'CAPACITY_EXCEEDED', 'RESOURCE_BUSY', 'DRIVER_LICENSE_EXPIRED', 'INVALID_TRANSITION',
    'ITEMS_PENDING', 'STOPS_OPEN', 'TRIP_CLOSED', 'STOP_CLOSED', 'REQUEST_REUSED', 'CYLINDER_IN_TRIP',
  ])('%s responde 409 e traz os detalhes do banco', async (code) => {
    const { call } = handlerFor({ code, trip_id: 't1', trip_number: 4 });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code, trip_id: 't1', trip_number: 4 });
  });

  it('código desconhecido continua sendo erro interno', async () => {
    const response = await handlerFor({ code: 'NAO_EXISTE' }).call();
    expect(response.status).toBe(500);
  });
});

describe('códigos de sucesso de viagem', () => {
  it.each(['LOADING', 'REVERTED', 'CHECKED', 'UNCHECKED', 'REMOVED', 'STARTED', 'ARRIVED', 'DELIVERED', 'UNLOCKED', 'RETURNED', 'COMPLETED', 'CANCELLED'])(
    '%s responde 200',
    async (code) => {
      const response = await handlerFor({ code, version: 2 }).call();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ code, version: 2 });
    },
  );

  it('os códigos de sucesso antigos seguem iguais', async () => {
    for (const code of ['CREATED', 'UPDATED', 'LISTED', 'FOUND', 'STOCKED']) expect((await handlerFor({ code }).call()).status).toBe(200);
  });
});

describe('negações continuam auditadas', () => {
  it('ACCESS_DENIED responde 403 e audita a negação', async () => {
    const { call, gateway } = handlerFor({ code: 'ACCESS_DENIED' });
    expect((await call()).status).toBe(403);
    expect(gateway.audit).toHaveBeenCalledWith({ actorId: USER, action: 'trip.do_it', result: 'denied', reason: 'permission_denied' });
  });
});

describe('tipos de evento do cilindro', () => {
  it('a borda de cilindros conhece os cinco tipos que a viagem acrescenta', () => {
    for (const type of CYLINDER_TRIP_EVENT_TYPES) expect(EVENT_TYPES).toContain(type);
    expect(EVENT_TYPES).toHaveLength(17);
  });
});
