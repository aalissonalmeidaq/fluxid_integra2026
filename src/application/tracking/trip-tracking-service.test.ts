import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from './tracking-ports';
import { keepSelection, TripTrackingService } from './trip-tracking-service';

// Spec 015 (T018; US1): o serviço transforma a resposta do servidor numa view única para mapa, lista e contadores, calcula o frescor com
// a regra vigente e o relógio injetado, separa trechos nas lacunas e mantém a seleção entre atualizações.
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRIP = 'b1560000-0000-4000-8000-0000000000a1';
const DEVICE = 'b1580000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-10-22T15:00:00Z');
const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
const RULE = { id: null, version: 0, distance_m: 100, max_age_s: 120, max_accuracy_m: 50, valid_from: null };

const point = (id: string, secondsAgo: number, accuracy: number | null, extra: Record<string, unknown> = {}) => ({
  id, latitude: -7.23, longitude: -39.31, accuracy_m: accuracy, observed_at: at(secondsAgo), received_at: at(secondsAgo - 2), ...extra,
});
const tripRow = (overrides: Record<string, unknown> = {}) => ({
  trip_id: TRIP, trip_number: 9161, status: 'in_progress', started_at: at(1800),
  vehicle: { id: 'v', plate: 'TRQ1A11' }, driver: { id: 'd', name: 'Motorista Um' },
  session: { id: 's', status: 'active', platform: 'web_visible', capability: 'foreground_only', capability_changed_at: at(900),
    notifications_denied: false, last_online_confirmed_at: at(30), started_at: at(1700) },
  mobile: point('m2', 30, 15, { sync_kind: 'live', validity: 'valid' }),
  seals: [{ device_id: DEVICE, label: 'Lacre do C1', cylinder_id: 'c1', serial_number: 'TRK-A-1', item_status: 'in_transit',
    position: point('s2', 600, 9, { confirmed_at: at(600), quality: 'gps' }) }],
  open_occurrences: 0,
  ...overrides,
});

const transport = (body: unknown, status = 200) => ({ call: vi.fn(async () => ({ status, body })) }) satisfies TrackingTransport;
const service = (t: TrackingTransport, online = true) => new TripTrackingService(t, () => online, { now: () => NOW });

describe('lista de viagens em andamento', () => {
  it('pede a consulta à query-tracking com filtros e cursor', async () => {
    const t = transport({ code: 'LISTED', generated_at: at(0), rule: RULE, items: [], next_cursor: null });
    await service(t).listActive(ORG, { filters: { vehicleId: TRIP }, cursor: { occurredAt: at(10), id: TRIP } });
    expect(t.call).toHaveBeenCalledWith('query-tracking', {
      operation: 'list_active_trip_tracking', organization_id: ORG, vehicle_id: TRIP, cursor_at: at(10), cursor_id: TRIP, limit: 50,
    });
  });

  it('cada origem recebe frescor pela regra vigente; nada é estimado', async () => {
    const t = transport({ code: 'LISTED', generated_at: at(0), rule: RULE, items: [tripRow()], next_cursor: null });
    const outcome = await service(t).listActive(ORG);
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    const row = outcome.value.rows[0]!;
    expect(row.origins.map((o) => [o.origin, o.label, o.freshness])).toEqual([
      ['mobile', 'Celular do motorista', 'current'],
      ['seal', 'Lacre do C1 · TRK-A-1', 'delayed'],
    ]);
    expect(row.degradation).toEqual({ reason: 'foreground_only', since: at(900) });
    expect(row.origins[0]!.position?.observedAt).toBe(at(30));
  });

  it('origem sem posição fica ausente e sem coordenada', async () => {
    const t = transport({ code: 'LISTED', generated_at: at(0), rule: RULE, items: [tripRow({ mobile: null, session: null })], next_cursor: null });
    const outcome = await service(t).listActive(ORG);
    if (outcome.kind !== 'success') throw new Error(outcome.kind);
    expect(outcome.value.rows[0]!.origins[0]).toMatchObject({ freshness: 'missing', position: null });
    expect(outcome.value.rows[0]!.degradation).toEqual({ reason: 'unavailable', since: at(1800) });
  });

  it('contadores vêm da mesma coleção da lista', async () => {
    const t = transport({ code: 'LISTED', generated_at: at(0), rule: RULE, items: [tripRow(), tripRow({ trip_id: 'outra', mobile: null })], next_cursor: null });
    const outcome = await service(t).listActive(ORG);
    if (outcome.kind !== 'success') throw new Error(outcome.kind);
    const byKey = Object.fromEntries(outcome.value.counters.map((c) => [c.key, c.value]));
    expect(byKey).toEqual({ trips: 2, current: 1, delayed: 2, missing: 1, inconclusive: 0, degraded: 2 });
    expect(outcome.value.counters.every((c) => c.kind === 'measured')).toBe(true);
  });

  it('devolve o próximo cursor', async () => {
    const t = transport({ code: 'LISTED', generated_at: at(0), rule: RULE, items: [tripRow()], next_cursor: { at: at(1800), id: TRIP } });
    const outcome = await service(t).listActive(ORG);
    if (outcome.kind !== 'success') throw new Error(outcome.kind);
    expect(outcome.value.nextCursor).toEqual({ at: at(1800), id: TRIP });
  });
});

describe('detalhe da viagem', () => {
  const detail = (recent: Record<string, unknown>) => transport({ code: 'FOUND', generated_at: at(0), rule: RULE, trip: tripRow(), recent });

  it('mapa e lista recebem as mesmas posições, com trechos separados nas lacunas', async () => {
    const t = detail({
      mobile: [point('m0', 1500, 15), point('m1', 1440, 15), point('m2', 30, 15)],
      seals: [{ device_id: DEVICE, positions: [point('s1', 660, 9), point('s2', 600, 9)] }],
    });
    const outcome = await service(t).getTrip(ORG, TRIP);
    if (outcome.kind !== 'success') throw new Error(outcome.kind);
    const view = outcome.value;
    expect(view.positions.map((p) => p.id).sort()).toEqual(['m0', 'm1', 'm2', 's1', 's2']);
    expect(view.segments.map((s) => [s.origin, s.positionIds])).toEqual([['mobile', ['m0', 'm1']], ['mobile', ['m2']], ['seal', ['s1', 's2']]]);
    expect(view.items.filter((i) => i.kind === 'gap')).toEqual([
      expect.objectContaining({ kind: 'gap', origin: 'mobile', occurredAt: at(1440), endedAt: at(30) }),
    ]);
  });

  it('a cronologia vem do mais recente para o mais antigo e inclui a degradação em curso', async () => {
    const outcome = await service(detail({ mobile: [point('m2', 30, 15)], seals: [] })).getTrip(ORG, TRIP);
    if (outcome.kind !== 'success') throw new Error(outcome.kind);
    expect(outcome.value.items.map((i) => i.kind)).toEqual(['position', 'degradation']);
    expect(outcome.value.items[1]).toMatchObject({ reason: 'foreground_only', occurredAt: at(900), endedAt: null });
  });

  it('posição retrospectiva fica identificada', async () => {
    const outcome = await service(detail({ mobile: [point('m2', 30, 15, { sync_kind: 'retrospective' })], seals: [] })).getTrip(ORG, TRIP);
    if (outcome.kind !== 'success') throw new Error(outcome.kind);
    expect(outcome.value.positions[0]!.retrospective).toBe(true);
  });
});

describe('falhas e conexão', () => {
  it.each([
    [{ code: 'NOT_FOUND' }, 404, 'not_found'], [{ code: 'ACCESS_DENIED' }, 403, 'access_denied'], [{ code: 'AUTH_REQUIRED' }, 401, 'session_expired'],
    [{ code: 'VALIDATION_FAILED' }, 400, 'invalid'], [{ code: 'X' }, 500, 'unavailable'],
  ] as const)('%o vira %s', async (body, status, kind) => {
    expect((await service(transport(body, status)).getTrip(ORG, TRIP)).kind).toBe(kind);
  });

  it('sem conexão, nem chama o servidor', async () => {
    const t = transport({});
    expect((await service(t, false).listActive(ORG)).kind).toBe('offline');
    expect(t.call).not.toHaveBeenCalled();
  });

  it('resposta 2xx malformada é indisponível, nunca sucesso', async () => {
    expect((await service(transport({ code: 'FOUND', trip: null })).getTrip(ORG, TRIP)).kind).toBe('unavailable');
  });
});

describe('situação do motorista (painel de coleta)', () => {
  it('diz se a pessoa é a motorista da viagem', async () => {
    const t = transport({ code: 'FOUND', is_driver: true, trip_status: 'in_progress', session: null });
    expect(await service(t).driverStatus(ORG, TRIP)).toEqual({ kind: 'success', value: { isDriver: true, tripStatus: 'in_progress' } });
    expect(t.call).toHaveBeenCalledWith('query-tracking', { operation: 'get_driver_tracking_status', organization_id: ORG, trip_id: TRIP });
  });

  it('lista as viagens da própria pessoa motorista ("Minha viagem")', async () => {
    const t = transport({ code: 'FOUND', is_driver: true, trips: [
      { id: TRIP, number: 2, status: 'in_progress', planned_date: '2026-10-22', started_at: at(600), vehicle_plate: 'DEM1A14', stop_count: 3 },
      { id: DEVICE, number: 3, status: 'planned', planned_date: '2026-10-23', started_at: null, vehicle_plate: 'DEM1A15', stop_count: 1 },
    ] });
    expect(await service(t).myDriverTrips(ORG)).toEqual({ kind: 'success', value: { isDriver: true, trips: [
      { id: TRIP, number: 2, status: 'in_progress', plannedDate: '2026-10-22', startedAt: at(600), vehiclePlate: 'DEM1A14', stopCount: 3 },
      { id: DEVICE, number: 3, status: 'planned', plannedDate: '2026-10-23', startedAt: null, vehiclePlate: 'DEM1A15', stopCount: 1 },
    ] } });
    expect(t.call).toHaveBeenCalledWith('query-tracking', { operation: 'list_my_driver_trips', organization_id: ORG });
  });

  it('resposta malformada vira falha, não lista vazia', async () => {
    const t = transport({ code: 'FOUND', is_driver: true, trips: [{ id: TRIP, number: 'dois' }] });
    expect((await service(t).myDriverTrips(ORG)).kind).toBe('unavailable');
  });
});

describe('seleção entre atualizações (RF-041)', () => {
  it('mantém a seleção se o item ainda existe e a solta se sumiu', () => {
    expect(keepSelection('m2', ['m1', 'm2'])).toBe('m2');
    expect(keepSelection('m9', ['m1', 'm2'])).toBeNull();
    expect(keepSelection(null, ['m1'])).toBeNull();
  });
});
