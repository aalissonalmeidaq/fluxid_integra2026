// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { endAllSessions, login, logout } from '../support/auth-harness';
import {
  createDriver, createEligibleCylinder, createVehicle, createWorld, GADMIN, manageCylinders, manageTrips, planBody, queryTrips, requestId, TENANT_G, type TripWorld,
} from '../support/trips-fixtures';

// Spec 008, RF-004 e RNF-002 (CA-002, MS-004), contra o Supabase local real: duas sessões planejando ao mesmo tempo viagens com o mesmo
// cilindro (uma vence e a outra recebe CYLINDER_RESERVED com a viagem vencedora), duas viagens com os mesmos cilindros em ordem diferente
// (sem impasse) e 50 repetições sem nenhuma reserva duplicada. Exige as funções query-trips e manage-trips carregadas (supabase stop/start).
const sorted = (...values: number[]): number[] => [...values].sort((a, b) => a - b);

describe('Reserva concorrente de cilindros ao vivo (Spec 008)', () => {
  let t1 = '';
  let t2 = '';
  let world: TripWorld;

  beforeAll(async () => {
    await endAllSessions(GADMIN);
    const [a, b] = [await login(GADMIN), await login(GADMIN)];
    expect([a.status, b.status]).toEqual([200, 200]);
    t1 = a.body.session.access_token as string;
    t2 = b.body.session.access_token as string;
    world = await createWorld(t1);
  }, 120_000);

  afterAll(async () => {
    for (const accessToken of [t1, t2]) if (accessToken) await logout(accessToken);
    await endAllSessions(GADMIN);
  });

  it('duas sessões planejando o mesmo cilindro ao mesmo tempo: uma vence e a outra recebe a viagem vencedora', async () => {
    const cylinder = await createEligibleCylinder(t1, world.typeId);
    const [a, b] = await Promise.all([
      manageTrips(t1, planBody(world, [{ cylinder_ids: [cylinder.id] }])),
      manageTrips(t2, planBody(world, [{ cylinder_ids: [cylinder.id] }])),
    ]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('CYLINDER_RESERVED');
    expect(loser.body.trip_id).toBe(winner.body.trip_id);
    expect(loser.body.trip_number).toBe(winner.body.number);
    expect(loser.body.cylinder_id).toBe(cylinder.id);
  }, 60_000);

  it('duas viagens com os mesmos cilindros em ordem diferente não geram impasse', async () => {
    const [x, y] = [await createEligibleCylinder(t1, world.typeId), await createEligibleCylinder(t1, world.typeId)];
    for (let round = 0; round < 3; round += 1) {
      const [p, q] = [await createEligibleCylinder(t1, world.typeId), await createEligibleCylinder(t1, world.typeId)];
      const [a, b] = await Promise.all([
        manageTrips(t1, planBody(world, [{ cylinder_ids: [p.id, q.id] }])),
        manageTrips(t2, planBody(world, [{ cylinder_ids: [q.id, p.id] }])),
      ]);
      expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
      expect((a.status === 409 ? a : b).body.code).toBe('CYLINDER_RESERVED');
    }
    const [a, b] = await Promise.all([
      manageTrips(t1, planBody(world, [{ cylinder_ids: [x.id] }, { cylinder_ids: [y.id] }])),
      manageTrips(t2, planBody(world, [{ cylinder_ids: [y.id] }, { cylinder_ids: [x.id] }])),
    ]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
  }, 120_000);

  it('50 repetições: exatamente uma reserva por cilindro, nenhuma duplicada', async () => {
    const cylinders = [];
    for (let i = 0; i < 50; i += 1) cylinders.push(await createEligibleCylinder(t1, world.typeId));
    const winners = new Map<string, string>();
    for (const cylinder of cylinders) {
      const [a, b] = await Promise.all([
        manageTrips(t1, planBody(world, [{ cylinder_ids: [cylinder.id] }])),
        manageTrips(t2, planBody(world, [{ cylinder_ids: [cylinder.id] }])),
      ]);
      expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
      winners.set(cylinder.id, (a.status === 200 ? a : b).body.trip_id as string);
    }
    expect(winners.size).toBe(50);
    // Nenhum dos 50 continua elegível: cada um tem exatamente uma reserva aberta.
    let eligible = 0;
    let cursor: string | null = null;
    do {
      const page: { body: { items: Array<{ id: string }>; next: string | null } } = await queryTrips(t1, { operation: 'list_eligible_cylinders', organization_id: TENANT_G, limit: 100, ...(cursor ? { cursor } : {}) }) as never;
      eligible += page.body.items.filter((item) => winners.has(item.id)).length;
      cursor = page.body.next;
    } while (cursor);
    expect(eligible).toBe(0);
  }, 300_000);

  it('o mesmo request_id repetido devolve a mesma viagem, sem reservar de novo', async () => {
    const cylinder = await createEligibleCylinder(t1, world.typeId);
    const body = planBody(world, [{ cylinder_ids: [cylinder.id] }], { request_id: requestId() });
    const [first, second] = await Promise.all([manageTrips(t1, body), manageTrips(t2, body)]);
    expect([first.status, second.status], JSON.stringify([first.body, second.body])).toEqual([200, 200]);
    expect(first.body.trip_id).toBe(second.body.trip_id);
    expect([first.body.replayed, second.body.replayed].filter(Boolean)).toHaveLength(1);
  }, 60_000);
});

describe('Veículo e motorista ocupados ao vivo (Spec 008, RF-006a)', () => {
  let t1 = '';
  let t2 = '';
  let world: TripWorld;

  beforeAll(async () => {
    await endAllSessions(GADMIN);
    const [a, b] = [await login(GADMIN), await login(GADMIN)];
    t1 = a.body.session.access_token as string;
    t2 = b.body.session.access_token as string;
    world = await createWorld(t1);
  }, 120_000);

  afterAll(async () => {
    for (const accessToken of [t1, t2]) if (accessToken) await logout(accessToken);
    await endAllSessions(GADMIN);
  });

  const planFor = async (vehicleId: string, driverId: string): Promise<{ tripId: string; version: number }> => {
    const cylinder = await createEligibleCylinder(t1, world.typeId);
    const created = await manageTrips(t1, planBody({ ...world, vehicleId, driverId }, [{ cylinder_ids: [cylinder.id] }]));
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    return { tripId: created.body.trip_id as string, version: created.body.version as number };
  };
  const startLoading = (token: string, trip: { tripId: string; version: number }) =>
    manageTrips(token, { operation: 'start_loading', organization_id: TENANT_G, request_id: requestId(), trip_id: trip.tripId, expected_version: trip.version });

  it('duas viagens planejadas com o mesmo veículo: só uma começa a carregar, a outra recebe a que o ocupa', async () => {
    const otherDriver = await createDriver(t1);
    const [one, two] = [await planFor(world.vehicleId, world.driverId), await planFor(world.vehicleId, otherDriver)];
    const [a, b] = await Promise.all([startLoading(t1, one), startLoading(t2, two)]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('RESOURCE_BUSY');
    expect(loser.body.entity).toBe('vehicle');
    expect(loser.body.trip_id).toBe((a.status === 200 ? one : two).tripId);
  }, 120_000);

  it('duas viagens planejadas com o mesmo motorista: só uma começa a carregar', async () => {
    const otherVehicle = await createVehicle(t1);
    const driver = await createDriver(t1);
    const [one, two] = [await planFor(world.vehicleId === otherVehicle ? await createVehicle(t1) : await createVehicle(t1), driver), await planFor(otherVehicle, driver)];
    const [a, b] = await Promise.all([startLoading(t1, one), startLoading(t2, two)]);
    expect(sorted(a.status, b.status), JSON.stringify([a.body, b.body])).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('RESOURCE_BUSY');
    expect(loser.body.entity).toBe('driver');
  }, 120_000);

  it('o fluxo completo pelas funções: conferir, retirar com exceção e iniciar a viagem', async () => {
    const cylinders = [await createEligibleCylinder(t1, world.typeId), await createEligibleCylinder(t1, world.typeId), await createEligibleCylinder(t1, world.typeId)];
    const vehicle = await createVehicle(t1);
    const driver = await createDriver(t1);
    const created = await manageTrips(t1, planBody({ ...world, vehicleId: vehicle, driverId: driver }, [{ cylinder_ids: cylinders.map((cylinder) => cylinder.id) }]));
    const tripId = created.body.trip_id as string;
    const loading = await manageTrips(t1, { operation: 'start_loading', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: 1 });
    expect(loading.body.code, JSON.stringify(loading.body)).toBe('LOADING');

    const read = async () => (await queryTrips(t1, { operation: 'get_trip', organization_id: TENANT_G, trip_id: tripId })).body;
    let detail = await read();
    const itemOf = (serial: string): string => detail.items.find((item: { cylinder: { serial_number: string } }) => item.cylinder.serial_number === serial).id as string;
    const act = (operation: string, extra: Record<string, unknown>) => manageTrips(t1, { operation, organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, ...extra });

    const pending = await manageTrips(t1, { operation: 'start_trip', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: loading.body.version });
    expect([pending.status, pending.body.code]).toEqual([409, 'ITEMS_PENDING']);
    expect(pending.body.item_ids).toHaveLength(3);

    expect((await act('check_item', { item_id: itemOf(cylinders[0]!.serial) })).body.code).toBe('CHECKED');
    expect((await act('check_item', { item_id: itemOf(cylinders[1]!.serial) })).body.code).toBe('CHECKED');
    expect((await act('remove_item', { item_id: itemOf(cylinders[2]!.serial), justification: 'Cilindro avariado' })).body.code).toBe('REMOVED');
    expect((await act('remove_item', { item_id: itemOf(cylinders[0]!.serial), justification: '' })).body.code).toBe('JUSTIFICATION_REQUIRED');

    const started = await manageTrips(t1, { operation: 'start_trip', organization_id: TENANT_G, request_id: requestId(), trip_id: tripId, expected_version: loading.body.version });
    expect([started.status, started.body.code], JSON.stringify(started.body)).toEqual([200, 'STARTED']);
    detail = await read();
    expect(detail.trip.status).toBe('in_progress');
    expect(detail.items.filter((item: { item_status: string }) => item.item_status === 'in_transit')).toHaveLength(2);
    expect(detail.items.every((item: { item_status: string; lock_status: string }) => (item.item_status === 'in_transit' ? item.lock_status === 'locked' : true))).toBe(true);
    expect(detail.items.find((item: { cylinder: { serial_number: string } }) => item.cylinder.serial_number === cylinders[0]!.serial).cylinder.custody_status).toBe('in_transit');
    // O cilindro retirado voltou a ser elegível; os que saíram não.
    const eligible = (await queryTrips(t1, { operation: 'list_eligible_cylinders', organization_id: TENANT_G, search: cylinders[2]!.serial })).body.items;
    expect(eligible).toHaveLength(1);
    expect((await queryTrips(t1, { operation: 'list_eligible_cylinders', organization_id: TENANT_G, search: cylinders[0]!.serial })).body.items).toHaveLength(0);
    // A entrada no estoque (Spec 006) de um cilindro em trânsito é recusada com a viagem.
    const stock = await manageCylinders(t1, { operation: 'stock_in', organization_id: TENANT_G, identifier_value: cylinders[0]!.identifier, operation_key: crypto.randomUUID() });
    expect([stock.status, stock.body.code, stock.body.trip_id]).toEqual([409, 'CYLINDER_IN_TRIP', tripId]);
  }, 180_000);
});
