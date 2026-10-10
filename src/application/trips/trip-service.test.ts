import { afterEach, describe, expect, it, vi } from 'vitest';
import { newRequestId, TripService, type TripTransport } from './trip-service';

// Fundação do serviço de viagens: estados de tela por código do servidor, request_id por comando e nada guardado no aparelho.

const ORG = '20000000-0000-4000-8000-00000000000a';
const reply = (status: number, body: unknown) => ({ status, body });
const transport = (response: { status: number; body: unknown }): TripTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => response) }) as never;
const pick = (payload: Record<string, unknown>) => (payload.code === 'CREATED' ? { id: String(payload.trip_id) } : null);

afterEach(() => vi.restoreAllMocks());

describe('executores', () => {
  it('consulta devolve sucesso tipado e não leva request_id', async () => {
    const t = transport(reply(200, { code: 'CREATED', trip_id: 't1' }));
    const outcome = await new TripService(t).query(ORG, 'get_trip', { trip_id: 't1' }, pick);
    expect(outcome).toEqual({ kind: 'success', value: { id: 't1' } });
    expect(t.call).toHaveBeenCalledWith('query-trips', { operation: 'get_trip', organization_id: ORG, trip_id: 't1' });
  });

  it('comando vai para manage-trips com request_id e sem campos indefinidos', async () => {
    const t = transport(reply(200, { code: 'CREATED', trip_id: 't1' }));
    await new TripService(t).command(ORG, 'create_trip', { notes: undefined, vehicle_id: 'v' }, pick, 'req-1');
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'create_trip', organization_id: ORG, request_id: 'req-1', vehicle_id: 'v' });
  });

  it('request_id novo por tentativa e o mesmo na repetição do mesmo envio', async () => {
    const t = transport(reply(200, { code: 'CREATED', trip_id: 't1' }));
    const service = new TripService(t);
    await service.command(ORG, 'create_trip', {}, pick);
    await service.command(ORG, 'create_trip', {}, pick);
    const fixed = newRequestId();
    await service.command(ORG, 'create_trip', {}, pick, fixed);
    await service.command(ORG, 'create_trip', {}, pick, fixed);
    const ids = t.call.mock.calls.map((call) => (call[1] as { request_id: string }).request_id);
    expect(new Set(ids.slice(0, 2)).size).toBe(2);
    expect(ids[2]).toBe(ids[3]);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('offline e falhas de rede', () => {
  it('sem conexão não chama o servidor, em leitura e em escrita', async () => {
    const t = transport(reply(200, {}));
    const service = new TripService(t, () => false);
    expect(await service.query(ORG, 'list_trips', {}, () => 1)).toEqual({ kind: 'offline' });
    expect(await service.command(ORG, 'create_trip', {}, () => 1)).toEqual({ kind: 'offline' });
    expect(t.call).not.toHaveBeenCalled();
  });

  it('rede que cai: leitura fica indisponível e escrita fica com resultado desconhecido', async () => {
    const t = { call: vi.fn(async () => { throw new Error('rede'); }) } as TripTransport;
    const service = new TripService(t);
    expect(await service.query(ORG, 'list_trips', {}, () => 1)).toEqual({ kind: 'unavailable' });
    expect(await service.command(ORG, 'create_trip', {}, () => 1)).toEqual({ kind: 'unknown' });
  });

  it('2xx que não se reconhece nunca vira sucesso', async () => {
    const service = new TripService(transport(reply(200, { code: 'OUTRO' })));
    expect(await service.query(ORG, 'get_trip', {}, pick)).toEqual({ kind: 'unavailable' });
    expect(await service.command(ORG, 'create_trip', {}, pick)).toEqual({ kind: 'unknown' });
  });

  it('erro 5xx ou código desconhecido é indisponível ou desconhecido', async () => {
    expect(await new TripService(transport(reply(500, { code: 'INTERNAL_ERROR' }))).command(ORG, 'x', {}, pick)).toEqual({ kind: 'unknown' });
    expect(await new TripService(transport(reply(409, { code: 'NOVO_CODIGO' }))).query(ORG, 'x', {}, pick)).toEqual({ kind: 'unavailable' });
  });
});

describe('códigos do servidor viram estados de tela', () => {
  const kindOf = async (code: string, status: number, extra: Record<string, unknown> = {}) =>
    new TripService(transport(reply(status, { code, ...extra }))).command(ORG, 'x', {}, pick);

  it.each([
    ['AUTH_REQUIRED', 401, 'session_expired'], ['ACCESS_DENIED', 403, 'access_denied'], ['MFA_REQUIRED', 403, 'mfa_required'], ['NOT_FOUND', 404, 'not_found'],
    ['VALIDATION_FAILED', 400, 'invalid'], ['JUSTIFICATION_REQUIRED', 400, 'justification_required'], ['VERSION_CONFLICT', 409, 'version_conflict'],
    ['CAPACITY_EXCEEDED', 409, 'capacity_exceeded'], ['PARENT_INACTIVE', 409, 'parent_inactive'], ['DRIVER_LICENSE_EXPIRED', 409, 'driver_license_expired'],
    ['INVALID_TRANSITION', 409, 'invalid_transition'], ['ITEMS_PENDING', 409, 'items_pending'], ['STOPS_OPEN', 409, 'stops_open'],
    ['TRIP_CLOSED', 409, 'trip_closed'], ['STOP_CLOSED', 409, 'stop_closed'], ['REQUEST_REUSED', 409, 'request_reused'],
    ['RESOURCE_BUSY', 409, 'resource_busy'], ['CYLINDER_RESERVED', 409, 'cylinder_reserved'], ['CYLINDER_NOT_ELIGIBLE', 409, 'cylinder_not_eligible'],
  ])('%s → %s', async (code, status, kind) => {
    expect(await kindOf(code, status)).toMatchObject({ kind });
  });

  it('cilindro reservado traz a viagem que o reservou', async () => {
    expect(await kindOf('CYLINDER_RESERVED', 409, { trip_id: 't9', trip_number: 12, cylinder_id: 'c1' })).toEqual({ kind: 'cylinder_reserved', trip: { id: 't9', number: 12 }, cylinderId: 'c1' });
  });

  it('cilindro não elegível traz o motivo', async () => {
    expect(await kindOf('CYLINDER_NOT_ELIGIBLE', 409, { cylinder_id: 'c1', reason: 'hydro_expired' })).toEqual({ kind: 'cylinder_not_eligible', cylinderId: 'c1', reason: 'hydro_expired' });
  });

  it('capacidade, ocupação, transição, pendências e erros por campo', async () => {
    expect(await kindOf('CAPACITY_EXCEEDED', 409, { capacity: 4, requested: 5 })).toEqual({ kind: 'capacity_exceeded', capacity: 4, requested: 5 });
    expect(await kindOf('RESOURCE_BUSY', 409, { entity: 'vehicle', trip_id: 't2', trip_number: 3 })).toEqual({ kind: 'resource_busy', entity: 'vehicle', trip: { id: 't2', number: 3 } });
    expect(await kindOf('INVALID_TRANSITION', 409, { from: 'planned', to: 'completed' })).toEqual({ kind: 'invalid_transition', from: 'planned', to: 'completed' });
    expect(await kindOf('ITEMS_PENDING', 409, { item_ids: ['i1', 'i2'] })).toEqual({ kind: 'items_pending', itemIds: ['i1', 'i2'] });
    expect(await kindOf('STOPS_OPEN', 409, { stop_ids: ['s1'] })).toEqual({ kind: 'stops_open', stopIds: ['s1'] });
    expect(await kindOf('PARENT_INACTIVE', 409, { entity: 'driver', entity_id: 'd1' })).toEqual({ kind: 'parent_inactive', entity: 'driver', entityId: 'd1' });
    expect(await kindOf('VALIDATION_FAILED', 400, { fields: [{ field: 'notes', message: 'Muito longo.' }, { field: 1, message: 'x' }] })).toEqual({ kind: 'invalid', fields: { notes: 'Muito longo.' } });
  });
});

describe('nada fica no aparelho', () => {
  it('o serviço não usa localStorage, sessionStorage nem IndexedDB', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const t = transport(reply(200, { code: 'CREATED', trip_id: 't1' }));
    await new TripService(t).command(ORG, 'create_trip', {}, pick);
    await new TripService(t).query(ORG, 'get_trip', {}, pick);
    expect(local).not.toHaveBeenCalled();
    expect(globalThis.localStorage.length).toBe(0);
    expect(globalThis.sessionStorage.length).toBe(0);
  });
});

// ----- Planejamento e consulta (US1) -----

describe('planejamento', () => {
  const form = {
    plannedDate: '2026-10-20', vehicleId: 'v1', driverId: 'd1', notes: null,
    stops: [{ siteId: 's1', cylinderIds: ['c1', 'c2'] }, { id: 'st2', siteId: 's2', cylinderIds: ['c3'] }],
  };

  it('createTrip envia o corpo do contrato com request_id e devolve o número', async () => {
    const t = transport(reply(200, { code: 'CREATED', trip_id: 't1', number: 12, version: 1 }));
    const outcome = await new TripService(t).createTrip(ORG, form, 'req-1');
    expect(outcome).toEqual({ kind: 'success', value: { tripId: 't1', number: 12, version: 1 } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', {
      operation: 'create_trip', organization_id: ORG, request_id: 'req-1', planned_date: '2026-10-20', vehicle_id: 'v1', driver_id: 'd1', notes: null,
      stops: [{ site_id: 's1', cylinder_ids: ['c1', 'c2'] }, { id: 'st2', site_id: 's2', cylinder_ids: ['c3'] }],
    });
  });

  it('updateTrip leva a viagem e a versão esperada', async () => {
    const t = transport(reply(200, { code: 'UPDATED', version: 3 }));
    const outcome = await new TripService(t).updateTrip(ORG, 't1', 2, form, 'req-2');
    expect(outcome).toEqual({ kind: 'success', value: { version: 3 } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', expect.objectContaining({ operation: 'update_trip', trip_id: 't1', expected_version: 2, request_id: 'req-2' }));
  });

  it('resposta de criação sem número é tratada como resultado desconhecido', async () => {
    expect(await new TripService(transport(reply(200, { code: 'CREATED', trip_id: 't1' }))).createTrip(ORG, form)).toEqual({ kind: 'unknown' });
  });

  it.each([
    ['CYLINDER_RESERVED', { trip_id: 't9', trip_number: 3, cylinder_id: 'c1' }, { kind: 'cylinder_reserved', trip: { id: 't9', number: 3 }, cylinderId: 'c1' }],
    ['CAPACITY_EXCEEDED', { capacity: 4, requested: 5 }, { kind: 'capacity_exceeded', capacity: 4, requested: 5 }],
    ['CYLINDER_NOT_ELIGIBLE', { cylinder_id: 'c1', reason: 'hydro_expired' }, { kind: 'cylinder_not_eligible', cylinderId: 'c1', reason: 'hydro_expired' }],
    ['PARENT_INACTIVE', { entity: 'vehicle', entity_id: 'v1' }, { kind: 'parent_inactive', entity: 'vehicle', entityId: 'v1' }],
  ])('%s vira um estado de tela com os detalhes', async (code, extra, expected) => {
    expect(await new TripService(transport(reply(409, { code, ...extra }))).createTrip(ORG, form)).toEqual(expected);
  });

  it('listTrips traduz os filtros e devolve a página', async () => {
    const item = { id: 't1', number: 1, planned_date: '2026-10-20', status: 'planned', version: 1, overdue: false, vehicle: null, driver: null, stops: 1, cylinders: 2, divergences: 0 };
    const t = transport(reply(200, { code: 'LISTED', items: [item], total: 1, next: null }));
    const outcome = await new TripService(t).listTrips(ORG, { search: ' AAA ', status: 'all', vehicleId: 'v1', custody: 'in_transit', sort: 'date_desc', limit: 10 });
    expect(outcome).toMatchObject({ kind: 'success', value: { total: 1, items: [{ id: 't1', stops: 1, cylinders: 2 }] } });
    expect(t.call).toHaveBeenCalledWith('query-trips', { operation: 'list_trips', organization_id: ORG, search: 'AAA', status: 'all', vehicle_id: 'v1', custody: 'in_transit', sort: 'date_desc', limit: 10 });
  });

  it('tripHistory traduz os filtros e devolve os eventos e o cursor', async () => {
    const event = { id: 'e1', sequence: 2, event_type: 'item_checked', occurred_at: '2026-10-09T10:00:00Z', justification: null, data: {}, actor_name: 'Ana' };
    const t = transport(reply(200, { code: 'LISTED', events: [event], next: 'p2' }));
    const outcome = await new TripService(t).tripHistory(ORG, 't1', { eventType: 'item_checked', from: '2026-10-01', order: 'asc', cursor: 'c', limit: 10 });
    expect(outcome).toMatchObject({ kind: 'success', value: { next: 'p2', events: [{ id: 'e1', sequence: 2, eventType: 'item_checked', actorName: 'Ana' }] } });
    expect(t.call).toHaveBeenCalledWith('query-trips', { operation: 'trip_history', organization_id: ORG, trip_id: 't1', event_type: 'item_checked', from: '2026-10-01', order: 'asc', cursor: 'c', limit: 10 });
  });

  it('tripHistory recusa evento de tipo desconhecido e sem permissão vira acesso negado', async () => {
    const bad = transport(reply(200, { code: 'LISTED', events: [{ id: 'e1', sequence: 1, event_type: 'inventado', occurred_at: '2026-10-09T10:00:00Z', data: {} }], next: null }));
    expect(await new TripService(bad).tripHistory(ORG, 't1')).toEqual({ kind: 'unavailable' });
    expect(await new TripService(transport(reply(403, { code: 'ACCESS_DENIED' }))).tripHistory(ORG, 't1')).toEqual({ kind: 'access_denied' });
  });

  it('tripsOfCylinder e tripsOfSite devolvem a viagem com a situação do cilindro ou da parada', async () => {
    const trip = { id: 't1', number: 4, planned_date: '2026-10-20', status: 'in_progress', version: 2, overdue: false, vehicle: null, driver: null, stops: 1, cylinders: 2, divergences: 0 };
    const cylinder = transport(reply(200, { code: 'LISTED', items: [{ ...trip, item_status: 'in_transit', lock_status: 'locked' }], next: null }));
    expect(await new TripService(cylinder).tripsOfCylinder(ORG, 'c1', { cursor: 'x', limit: 5 })).toMatchObject({ kind: 'success', value: { items: [{ number: 4, itemStatus: 'in_transit', lockStatus: 'locked' }], next: null } });
    expect(cylinder.call).toHaveBeenCalledWith('query-trips', { operation: 'trips_of_cylinder', organization_id: ORG, cylinder_id: 'c1', cursor: 'x', limit: 5 });
    const site = transport(reply(200, { code: 'LISTED', items: [{ ...trip, stop_status: 'pending' }, { ...trip, id: 't2', stop_status: 'inventada' }], next: null }));
    expect(await new TripService(site).tripsOfSite(ORG, 's1')).toEqual({ kind: 'unavailable' });
    const ok = transport(reply(200, { code: 'LISTED', items: [{ ...trip, stop_status: 'delivered' }], next: 'n2' }));
    expect(await new TripService(ok).tripsOfSite(ORG, 's1')).toMatchObject({ kind: 'success', value: { items: [{ stopStatus: 'delivered' }], next: 'n2' } });
    expect(ok.call).toHaveBeenCalledWith('query-trips', { operation: 'trips_of_site', organization_id: ORG, site_id: 's1' });
  });

  it('getTrip, tripOptions e listEligibleCylinders usam as consultas do contrato', async () => {
    const t = transport(reply(200, { code: 'LISTED', vehicles: [], drivers: [], sites: [], items: [], next: null }));
    const service = new TripService(t);
    expect(await service.tripOptions(ORG, ' aaa ')).toEqual({ kind: 'success', value: { vehicles: [], drivers: [], sites: [] } });
    expect(await service.listEligibleCylinders(ORG, { search: 'CIL', cylinderTypeId: 'ty1', cursor: 'abc', limit: 20 })).toEqual({ kind: 'success', value: { items: [], next: null } });
    expect(await service.getTrip(ORG, 't1')).toEqual({ kind: 'unavailable' });
    expect(t.call).toHaveBeenCalledWith('query-trips', { operation: 'trip_options', organization_id: ORG, search: 'aaa' });
    expect(t.call).toHaveBeenCalledWith('query-trips', { operation: 'list_eligible_cylinders', organization_id: ORG, search: 'CIL', cylinder_type_id: 'ty1', cursor: 'abc', limit: 20 });
    expect(t.call).toHaveBeenCalledWith('query-trips', { operation: 'get_trip', organization_id: ORG, trip_id: 't1' });
  });
});

// ----- Carregamento e início (US2) -----

describe('carregamento e início', () => {
  it('startLoading, revertLoading e startTrip enviam a viagem e a versão esperada', async () => {
    const t = transport(reply(200, { code: 'LOADING', version: 3 }));
    const service = new TripService(t);
    expect(await service.startLoading(ORG, 't1', 2, 'r1')).toEqual({ kind: 'success', value: { version: 3 } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'start_loading', organization_id: ORG, request_id: 'r1', trip_id: 't1', expected_version: 2 });
    const reverted = new TripService(transport(reply(200, { code: 'REVERTED', version: 4 })));
    expect(await reverted.revertLoading(ORG, 't1', 3)).toEqual({ kind: 'success', value: { version: 4 } });
    const started = new TripService(transport(reply(200, { code: 'STARTED', version: 5 })));
    expect(await started.startTrip(ORG, 't1', 4)).toEqual({ kind: 'success', value: { version: 5 } });
  });

  it('um código de sucesso diferente do esperado nunca vira sucesso', async () => {
    expect(await new TripService(transport(reply(200, { code: 'REVERTED', version: 1 }))).startLoading(ORG, 't1', 1)).toEqual({ kind: 'unknown' });
    expect(await new TripService(transport(reply(200, { code: 'STARTED' }))).startTrip(ORG, 't1', 1)).toEqual({ kind: 'unknown' });
  });

  it('checkItem e uncheckItem devolvem a contagem de conferidos', async () => {
    const t = transport(reply(200, { code: 'CHECKED', checked: 2, total: 3 }));
    expect(await new TripService(t).checkItem(ORG, 't1', 'i1', 'r2')).toEqual({ kind: 'success', value: { checked: 2, total: 3 } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'check_item', organization_id: ORG, request_id: 'r2', trip_id: 't1', item_id: 'i1' });
    expect(await new TripService(transport(reply(200, { code: 'UNCHECKED', checked: 1, total: 3 }))).uncheckItem(ORG, 't1', 'i1')).toEqual({ kind: 'success', value: { checked: 1, total: 3 } });
  });

  it('removeItem envia a justificativa', async () => {
    const t = transport(reply(200, { code: 'REMOVED' }));
    expect(await new TripService(t).removeItem(ORG, 't1', 'i1', 'Cilindro avariado', 'r3')).toEqual({ kind: 'success', value: { checked: 0, total: 0 } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', expect.objectContaining({ operation: 'remove_item', item_id: 'i1', justification: 'Cilindro avariado' }));
  });

  it.each([
    ['ITEMS_PENDING', { item_ids: ['i1', 'i2'] }, { kind: 'items_pending', itemIds: ['i1', 'i2'] }],
    ['INVALID_TRANSITION', { from: 'planned', to: 'in_progress' }, { kind: 'invalid_transition', from: 'planned', to: 'in_progress' }],
    ['DRIVER_LICENSE_EXPIRED', {}, { kind: 'driver_license_expired' }],
    ['RESOURCE_BUSY', { entity: 'driver', trip_id: 't9', trip_number: 2 }, { kind: 'resource_busy', entity: 'driver', trip: { id: 't9', number: 2 } }],
    ['CYLINDER_NOT_ELIGIBLE', { cylinder_id: 'c1', reason: 'hydro_expired' }, { kind: 'cylinder_not_eligible', cylinderId: 'c1', reason: 'hydro_expired' }],
    ['JUSTIFICATION_REQUIRED', {}, { kind: 'justification_required' }],
    ['ACCESS_DENIED', {}, { kind: 'access_denied' }],
  ])('%s vira um estado de tela', async (code, extra, expected) => {
    expect(await new TripService(transport(reply(409, { code, ...extra }))).startTrip(ORG, 't1', 1)).toEqual(expected);
  });
});

// ----- Chegada e entrega (US3) -----

describe('chegada e entrega', () => {
  const value = {
    deliveredAt: '2026-10-09T15:30:00.000Z', recipientName: 'Recebedor Fictício', recipientRole: null, latitude: -23.55, longitude: -46.63, atSiteAddress: false,
    results: [{ itemId: 'i1', delivered: true }, { itemId: 'i2', delivered: false, reason: 'Sem espaço' }],
  };

  it('arriveStop devolve se a chegada foi fora da ordem', async () => {
    const t = transport(reply(200, { code: 'ARRIVED', out_of_order: true }));
    expect(await new TripService(t).arriveStop(ORG, 't1', 's1', 'r1')).toEqual({ kind: 'success', value: { outOfOrder: true } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'arrive_stop', organization_id: ORG, request_id: 'r1', trip_id: 't1', stop_id: 's1' });
  });

  it('registerDelivery envia o corpo do contrato e devolve a situação da parada e a geocerca', async () => {
    const t = transport(reply(200, { code: 'DELIVERED', delivery_id: 'd1', stop_status: 'with_divergence', outside_geofence: true }));
    expect(await new TripService(t).registerDelivery(ORG, 't1', 's1', value, undefined, 'r2')).toEqual({ kind: 'success', value: { deliveryId: 'd1', stopStatus: 'with_divergence', outsideGeofence: true } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', {
      operation: 'register_delivery', organization_id: ORG, request_id: 'r2', trip_id: 't1', stop_id: 's1', delivered_at: '2026-10-09T15:30:00.000Z', recipient_name: 'Recebedor Fictício',
      recipient_role: null, latitude: -23.55, longitude: -46.63, at_site_address: false,
      results: [{ item_id: 'i1', delivered: true }, { item_id: 'i2', delivered: false, reason: 'Sem espaço' }],
    });
  });

  it('a correção leva o registro anterior', async () => {
    const t = transport(reply(200, { code: 'DELIVERED', delivery_id: 'd2', stop_status: 'delivered' }));
    expect(await new TripService(t).registerDelivery(ORG, 't1', 's1', value, 'd1')).toMatchObject({ kind: 'success', value: { stopStatus: 'delivered', outsideGeofence: null } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', expect.objectContaining({ supersedes_id: 'd1' }));
  });

  it('resposta de entrega incompleta nunca vira sucesso', async () => {
    expect(await new TripService(transport(reply(200, { code: 'DELIVERED' }))).registerDelivery(ORG, 't1', 's1', value)).toEqual({ kind: 'unknown' });
    expect(await new TripService(transport(reply(200, { code: 'DELIVERED', delivery_id: 'd', stop_status: 'pending' }))).registerDelivery(ORG, 't1', 's1', value)).toEqual({ kind: 'unknown' });
  });

  it.each([
    ['STOP_CLOSED', 409, { kind: 'stop_closed' }], ['TRIP_CLOSED', 409, { kind: 'trip_closed' }], ['INVALID_TRANSITION', 409, { kind: 'invalid_transition', from: 'pending', to: 'delivered' }],
  ])('%s vira um estado de tela', async (code, status, expected) => {
    expect(await new TripService(transport(reply(status, { code, from: 'pending', to: 'delivered' }))).registerDelivery(ORG, 't1', 's1', value)).toMatchObject(expected);
  });

  it('o corpo da entrega não é guardado no aparelho', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await new TripService(transport(reply(200, { code: 'DELIVERED', delivery_id: 'd1', stop_status: 'delivered' }))).registerDelivery(ORG, 't1', 's1', value);
    expect(setItem).not.toHaveBeenCalled();
    expect(globalThis.localStorage.length + globalThis.sessionStorage.length).toBe(0);
  });
});

// ----- Desbloqueio (US4) -----

describe('desbloqueio', () => {
  it('registerUnlock envia o cilindro e a justificativa e devolve se foi excepcional', async () => {
    const t = transport(reply(200, { code: 'UNLOCKED', exceptional: true }));
    expect(await new TripService(t).registerUnlock(ORG, 't1', 'i1', 'Cilindro precisa voltar', 'r1')).toEqual({ kind: 'success', value: { exceptional: true } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'register_unlock', organization_id: ORG, request_id: 'r1', trip_id: 't1', item_id: 'i1', justification: 'Cilindro precisa voltar' });
    expect(await new TripService(transport(reply(200, { code: 'UNLOCKED', exceptional: false }))).registerUnlock(ORG, 't1', 'i1', null)).toEqual({ kind: 'success', value: { exceptional: false } });
  });

  it('MFA_REQUIRED, falta de justificativa e a transição inválida viram estados de tela', async () => {
    expect(await new TripService(transport(reply(403, { code: 'MFA_REQUIRED' }))).registerUnlock(ORG, 't1', 'i1', 'Motivo válido')).toEqual({ kind: 'mfa_required' });
    expect(await new TripService(transport(reply(400, { code: 'JUSTIFICATION_REQUIRED' }))).registerUnlock(ORG, 't1', 'i1', null)).toEqual({ kind: 'justification_required' });
    expect(await new TripService(transport(reply(409, { code: 'INVALID_TRANSITION', from: 'unlocked', to: 'unlocked' }))).registerUnlock(ORG, 't1', 'i1', null)).toMatchObject({ kind: 'invalid_transition', from: 'unlocked' });
  });

  it('o serviço não oferece nenhuma operação de refazer o bloqueio', () => {
    const names = Object.getOwnPropertyNames(TripService.prototype);
    expect(names.filter((name) => /^(re-?lock|re-?block|lock|setLock|lockItem)/i.test(name))).toEqual([]);
    expect(names).toContain('registerUnlock');
  });
});

// ----- Encerramento (US5) -----

describe('encerramento', () => {
  it('completeTrip envia a viagem e a versão e devolve a nova versão', async () => {
    const t = transport(reply(200, { code: 'COMPLETED', version: 7 }));
    expect(await new TripService(t).completeTrip(ORG, 't1', 6, 'r1')).toEqual({ kind: 'success', value: { version: 7 } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'complete_trip', organization_id: ORG, request_id: 'r1', trip_id: 't1', expected_version: 6 });
  });

  it('cancelTrip envia a justificativa e devolve o que foi liberado e o que ficou em trânsito', async () => {
    const t = transport(reply(200, { code: 'CANCELLED', version: 3, released: 2, in_transit: 1 }));
    expect(await new TripService(t).cancelTrip(ORG, 't1', 2, 'Cliente desistiu', 'r2')).toEqual({ kind: 'success', value: { version: 3, released: 2, inTransit: 1 } });
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'cancel_trip', organization_id: ORG, request_id: 'r2', trip_id: 't1', expected_version: 2, justification: 'Cliente desistiu' });
  });

  it('returnItem envia o cilindro e a justificativa', async () => {
    const t = transport(reply(200, { code: 'RETURNED' }));
    expect(await new TripService(t).returnItem(ORG, 't1', 'i1', 'Volta ao depósito', 'r3')).toEqual({ kind: 'success', value: true });
    expect(t.call).toHaveBeenCalledWith('manage-trips', { operation: 'return_item', organization_id: ORG, request_id: 'r3', trip_id: 't1', item_id: 'i1', justification: 'Volta ao depósito' });
  });

  it('um código de sucesso diferente do esperado nunca vira sucesso', async () => {
    expect(await new TripService(transport(reply(200, { code: 'CANCELLED', version: 1 }))).completeTrip(ORG, 't1', 1)).toEqual({ kind: 'unknown' });
    expect(await new TripService(transport(reply(200, { code: 'COMPLETED' }))).cancelTrip(ORG, 't1', 1, 'Motivo válido')).toEqual({ kind: 'unknown' });
  });

  it.each([
    ['STOPS_OPEN', { stop_ids: ['s1', 's2'] }, { kind: 'stops_open', stopIds: ['s1', 's2'] }],
    ['TRIP_CLOSED', {}, { kind: 'trip_closed' }],
    ['JUSTIFICATION_REQUIRED', {}, { kind: 'justification_required' }],
    ['ACCESS_DENIED', {}, { kind: 'access_denied' }],
  ])('%s vira um estado de tela', async (code, extra, expected) => {
    expect(await new TripService(transport(reply(409, { code, ...extra }))).completeTrip(ORG, 't1', 1)).toEqual(expected);
  });
});
