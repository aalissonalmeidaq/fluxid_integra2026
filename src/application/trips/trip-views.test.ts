import { describe, expect, it } from 'vitest';
import { toEligibleCylinder, toPage, toTripDetail, toTripEvent, toTripListItem, toTripOptions } from './trip-views';

const listItem = {
  id: 't1', number: 7, planned_date: '2026-10-20', status: 'planned', version: 2, overdue: true, vehicle: { id: 'v1', plate: 'AAA1111' },
  driver: { id: 'd1', full_name: 'Motorista Alfa' }, stops: 2, cylinders: 4, divergences: 1,
};

describe('lista', () => {
  it('converte snake_case em camelCase', () => {
    expect(toTripListItem(listItem)).toEqual({
      id: 't1', number: 7, plannedDate: '2026-10-20', status: 'planned', version: 2, overdue: true, vehicle: { id: 'v1', plate: 'AAA1111' },
      driver: { id: 'd1', fullName: 'Motorista Alfa' }, stops: 2, cylinders: 4, divergences: 1,
    });
  });

  it('recusa situação desconhecida e item sem número ou data', () => {
    expect(toTripListItem({ ...listItem, status: 'paused' })).toBeNull();
    expect(toTripListItem({ ...listItem, number: 'x' })).toBeNull();
    expect(toTripListItem({ ...listItem, planned_date: null })).toBeNull();
    expect(toTripListItem(null)).toBeNull();
    expect(toTripListItem('t1')).toBeNull();
  });

  it('veículo ou motorista ausente vira nulo, sem derrubar o item', () => {
    expect(toTripListItem({ ...listItem, vehicle: null, driver: undefined })).toMatchObject({ vehicle: null, driver: null });
  });

  it('a página só existe com o código LISTED e itens válidos', () => {
    expect(toPage({ code: 'LISTED', items: [listItem], total: 9, next: 'abc' }, 'items', toTripListItem)).toMatchObject({ total: 9, next: 'abc', items: [{ id: 't1' }] });
    expect(toPage({ code: 'LISTED', items: [listItem, { id: 'x' }] }, 'items', toTripListItem)).toBeNull();
    expect(toPage({ code: 'OUTRO', items: [] }, 'items', toTripListItem)).toBeNull();
  });
});

const detail = () => ({
  code: 'FOUND', overdue: false,
  trip: { id: 't1', number: 7, planned_date: '2026-10-20', status: 'in_progress', notes: null, cancel_reason: null, version: 3, created_at: '2026-10-09T10:00:00Z', created_by_name: 'Ana', started_at: '2026-10-09T11:00:00Z', completed_at: null, cancelled_at: null },
  vehicle: { id: 'v1', plate: 'AAA1111', capacity_cylinders: 10, status: 'available', licensing_due_on: null, licensing_status: 'sem_data' },
  driver: { id: 'd1', full_name: 'Motorista Alfa', status: 'active', cnh_valid_until: '2030-01-01', cnh_status: 'em_dia' },
  stops: [{ id: 's1', position: 1, status: 'on_site', arrived_at: '2026-10-09T12:00:00Z', out_of_order: true, closed_at: null,
    site: { id: 'u1', name: 'Unidade 1', city: 'São Paulo', state: 'SP', customer_id: 'c1', customer_name: 'Alfa Saúde' } }],
  items: [{ id: 'i1', stop_id: 's1', item_status: 'in_transit', lock_status: 'locked', checked_at: '2026-10-09T10:30:00Z', checked_by_name: 'Ana', divergence_reason: null,
    cylinder: { id: 'c1', serial_number: 'CIL-001', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l', status: 'active', stock_status: 'out_of_stock', custody_status: 'in_transit', hydro_status: 'em_dia' } }],
  deliveries: [{ id: 'e1', stop_id: 's1', delivered_at: '2026-10-09T12:30:00Z', recipient_name: '(restrito)', recipient_role: '(restrito)', latitude: -23.5, longitude: -46.6, at_site_address: false,
    outside_geofence: true, results: [{ item_id: 'i1', delivered: false, reason: 'Sem espaço' }], supersedes_id: null, recorded_by_name: 'Ana', recorded_at: '2026-10-09T12:31:00Z' }],
  unlocks: [{ id: 'k1', item_id: 'i1', exceptional: true, justification: 'Precisa voltar', aal: 'aal2', actor_name: 'Ana', occurred_at: '2026-10-09T13:00:00Z' }],
  warnings: ['cnh_expiring'],
});

describe('detalhe', () => {
  it('converte a viagem inteira', () => {
    const view = toTripDetail(detail());
    expect(view).not.toBeNull();
    expect(view!.trip).toMatchObject({ id: 't1', number: 7, status: 'in_progress', startedAt: '2026-10-09T11:00:00Z', createdByName: 'Ana' });
    expect(view!.vehicle).toMatchObject({ plate: 'AAA1111', capacityCylinders: 10, licensingStatus: 'sem_data' });
    expect(view!.driver).toMatchObject({ fullName: 'Motorista Alfa', cnhStatus: 'em_dia' });
    expect(view!.stops[0]).toMatchObject({ outOfOrder: true, site: { customerName: 'Alfa Saúde' } });
    expect(view!.items[0]).toMatchObject({ itemStatus: 'in_transit', lockStatus: 'locked', cylinder: { serialNumber: 'CIL-001', custodyStatus: 'in_transit' } });
    expect(view!.deliveries[0]).toMatchObject({ recipientName: '(restrito)', outsideGeofence: true, results: [{ itemId: 'i1', delivered: false, reason: 'Sem espaço' }] });
    expect(view!.unlocks[0]).toMatchObject({ exceptional: true, aal: 'aal2' });
    expect(view!.warnings).toEqual(['cnh_expiring']);
  });

  it('valor desconhecido em qualquer parte invalida o detalhe (nunca é presumido)', () => {
    const broken = (patch: (value: ReturnType<typeof detail>) => void) => { const value = detail(); patch(value); return toTripDetail(value); };
    expect(broken((v) => { v.trip.status = 'paused'; })).toBeNull();
    expect(broken((v) => { v.stops[0]!.status = 'lost'; })).toBeNull();
    expect(broken((v) => { v.items[0]!.item_status = 'lost'; })).toBeNull();
    expect(broken((v) => { v.items[0]!.lock_status = 'welded'; })).toBeNull();
    expect(broken((v) => { v.items[0]!.cylinder.custody_status = 'gone'; })).toBeNull();
    expect(broken((v) => { v.vehicle.licensing_status = 'x'; })).toBeNull();
    expect(broken((v) => { v.warnings = ['novo_aviso']; })).toBeNull();
    expect(broken((v) => { v.deliveries[0]!.results = [{ item_id: 'i1' } as never]; })).toBeNull();
    expect(toTripDetail({ ...detail(), code: 'OUTRO' })).toBeNull();
  });
});

describe('opções e cilindros elegíveis', () => {
  it('converte as opções do formulário', () => {
    const options = toTripOptions({
      code: 'LISTED',
      vehicles: [{ id: 'v1', plate: 'AAA1111', capacity_cylinders: 10, licensing_due_on: null, licensing_status: 'sem_data' }],
      drivers: [{ id: 'd1', full_name: 'Motorista Alfa', cnh_valid_until: '2030-01-01', cnh_status: 'em_dia' }],
      sites: [{ id: 'u1', name: 'Unidade 1', city: 'São Paulo', state: 'SP', customer_id: 'c1', customer_name: 'Alfa Saúde' }],
    });
    expect(options).toEqual({
      vehicles: [{ id: 'v1', plate: 'AAA1111', capacityCylinders: 10, licensingDueOn: null, licensingStatus: 'sem_data' }],
      drivers: [{ id: 'd1', fullName: 'Motorista Alfa', cnhValidUntil: '2030-01-01', cnhStatus: 'em_dia' }],
      sites: [{ id: 'u1', name: 'Unidade 1', city: 'São Paulo', state: 'SP', customerId: 'c1', customerName: 'Alfa Saúde' }],
    });
    expect(toTripOptions({ code: 'LISTED', vehicles: [{ id: 'v1' }], drivers: [], sites: [] })).toBeNull();
  });

  it('converte o cilindro elegível e recusa teste desconhecido', () => {
    const entry = { id: 'c1', serial_number: 'CIL-001', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l', hydro_status: 'a_vencer' };
    expect(toEligibleCylinder(entry)).toEqual({ id: 'c1', serialNumber: 'CIL-001', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', hydroStatus: 'a_vencer' });
    expect(toEligibleCylinder({ ...entry, hydro_status: 'x' })).toBeNull();
  });
});

describe('histórico', () => {
  it('converte o evento e recusa tipo desconhecido', () => {
    const event = { id: 'e1', sequence: 3, event_type: 'trip_started', actor_name: 'Ana', occurred_at: '2026-10-09T11:00:00Z', justification: null, data: { items: 4 } };
    expect(toTripEvent(event)).toEqual({ id: 'e1', sequence: 3, eventType: 'trip_started', actorName: 'Ana', occurredAt: '2026-10-09T11:00:00Z', justification: null, data: { items: 4 } });
    expect(toTripEvent({ ...event, event_type: 'trip_exploded' })).toBeNull();
    expect(toTripEvent({ ...event, sequence: 'x' })).toBeNull();
  });
});
