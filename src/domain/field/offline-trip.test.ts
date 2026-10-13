// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyArrived, applyChecked, applyDelivered, applyUncheckQueued, applyUnchecked, findItemByCandidates, parseOfflineTrip, revertOptimistic, settlePending, stopItems, type OfflineTrip,
} from './offline-trip';

const raw = () => ({
  code: 'OK',
  fetched_at: '2026-10-12T12:00:00Z',
  trip: { id: 'T1', number: 7, planned_date: '2026-10-12', status: 'loading', version: 3 },
  vehicle: { plate: 'OFT1001' },
  stops: [
    { id: 'S2', position: 2, status: 'pending', arrived_at: null, site: { id: 'U2', name: 'Unidade 2', city: 'São Paulo', state: 'SP', customer_name: 'Hospital Alfa' } },
    { id: 'S1', position: 1, status: 'pending', arrived_at: null, site: { id: 'U1', name: 'Unidade 1', city: 'São Paulo', state: 'SP', customer_name: 'Hospital Alfa' } },
  ],
  items: [
    { id: 'I1', stop_id: 'S1', item_status: 'planned', lock_status: 'none', cylinder: { id: 'C1', serial_number: 'OFT-001', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l' }, identifiers: ['04A23B1C', 'QR-OFT-001'] },
    { id: 'I2', stop_id: 'S2', item_status: 'planned', lock_status: 'none', cylinder: { id: 'C2', serial_number: 'OFT-002', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l' }, identifiers: ['QR-OFT-002'] },
  ],
  deliveries: [{ id: 'D1', stop_id: 'S1' }],
});
const trip = (): OfflineTrip => parseOfflineTrip(raw())!;

describe('parseOfflineTrip', () => {
  it('lê a viagem, as paradas em ordem, os itens e as entregas', () => {
    const parsed = trip();
    expect(parsed).toMatchObject({ id: 'T1', number: 7, status: 'loading', version: 3, vehiclePlate: 'OFT1001', fetchedAt: '2026-10-12T12:00:00Z' });
    expect(parsed.stops.map((stop) => stop.id)).toEqual(['S1', 'S2']);
    expect(parsed.items[0]).toMatchObject({ id: 'I1', stopId: 'S1', itemStatus: 'planned', identifiers: ['04A23B1C', 'QR-OFT-001'], cylinder: { serialNumber: 'OFT-001' } });
    expect(parsed.deliveries).toEqual([{ id: 'D1', stopId: 'S1' }]);
  });

  it('só guarda a lista fechada de campos: nada sensível passa, mesmo que o servidor mande', () => {
    const dirty = raw() as Record<string, unknown>;
    dirty.driver = { full_name: 'Motorista Sigiloso' };
    (dirty.deliveries as Record<string, unknown>[])[0] = { id: 'D1', stop_id: 'S1', recipient_name: 'Recebedor Sigiloso', latitude: -23.55, longitude: -46.633, results: [] };
    (dirty.items as Record<string, unknown>[])[0]!.checked_by_name = 'Fulano';
    const json = JSON.stringify(parseOfflineTrip(dirty));
    for (const secret of ['Motorista Sigiloso', 'Recebedor Sigiloso', '-23.55', '-46.633', 'Fulano', 'recipient', 'latitude']) expect(json).not.toContain(secret);
  });

  it.each([null, undefined, 'x', 3, {}, { code: 'OK' }, { code: 'OK', trip: {} }, { code: 'NOT_FOUND' }])('recusa o corpo inválido %#', (value) => {
    expect(parseOfflineTrip(value)).toBeNull();
  });

  it('recusa situação que não serve para operar offline', () => {
    const planned = raw();
    planned.trip.status = 'planned';
    expect(parseOfflineTrip(planned)).toBeNull();
    const done = raw();
    done.trip.status = 'completed';
    expect(parseOfflineTrip(done)).toBeNull();
  });

  it('ignora item ou parada malformados em vez de quebrar', () => {
    const bad = raw();
    (bad.items as unknown[]).push({ id: 5 }, null, 'x');
    (bad.stops as unknown[]).push({ nope: true });
    const parsed = parseOfflineTrip(bad)!;
    expect(parsed.items).toHaveLength(2);
    expect(parsed.stops).toHaveLength(2);
  });
});

describe('findItemByCandidates', () => {
  it('acha o item pelo identificador ativo, sem diferenciar maiúsculas nem espaços', () => {
    expect(findItemByCandidates(trip(), ['qr-oft-001'])?.id).toBe('I1');
    expect(findItemByCandidates(trip(), ['  QR-OFT-002  '])?.id).toBe('I2');
  });
  it('o candidato que casa primeiro vale', () => {
    expect(findItemByCandidates(trip(), ['NADA', '04a23b1c', 'QR-OFT-002'])?.id).toBe('I1');
  });
  it('código que não é da viagem não é classificado', () => {
    expect(findItemByCandidates(trip(), ['QR-OUTRO'])).toBeNull();
    expect(findItemByCandidates(trip(), [])).toBeNull();
    expect(findItemByCandidates(trip(), [''])).toBeNull();
  });
});

describe('otimismo da tela (nada é confirmado)', () => {
  it('conferir marca o item como conferido e pendente, sem mexer nos outros', () => {
    const next = applyChecked(trip(), 'I1');
    expect(next.items.find((item) => item.id === 'I1')).toMatchObject({ itemStatus: 'checked', pending: true });
    expect(next.items.find((item) => item.id === 'I2')).toMatchObject({ itemStatus: 'planned' });
    expect(next.items.find((item) => item.id === 'I2')!.pending).toBeUndefined();
  });
  it('desfazer volta a planejado e limpa o pendente', () => {
    const next = applyUnchecked(applyChecked(trip(), 'I1'), 'I1');
    expect(next.items.find((item) => item.id === 'I1')).toMatchObject({ itemStatus: 'planned' });
    expect(next.items.find((item) => item.id === 'I1')!.pending).toBeUndefined();
  });
  it('desfazer uma conferência já confirmada volta a planejado, mas ainda pendente', () => {
    const next = applyUncheckQueued(trip(), 'I1');
    expect(next.items.find((item) => item.id === 'I1')).toMatchObject({ itemStatus: 'planned', pending: true });
  });
  it('chegar põe a parada no local, pendente, com o horário informado', () => {
    expect(applyArrived(trip(), 'S1', '2026-10-12T12:30:00Z').stops.find((stop) => stop.id === 'S1')).toMatchObject({ status: 'on_site', arrivedAt: '2026-10-12T12:30:00Z', pending: true });
  });
  it('entregar marca os itens como entregues ou não entregues, pendentes, e fecha a parada', () => {
    const next = applyDelivered(trip(), 'S1', [{ itemId: 'I1', delivered: true }]);
    expect(next.items.find((item) => item.id === 'I1')).toMatchObject({ itemStatus: 'delivered', pending: true });
    expect(next.stops.find((stop) => stop.id === 'S1')).toMatchObject({ status: 'delivered', pending: true });
    const divergence = applyDelivered(trip(), 'S1', [{ itemId: 'I1', delivered: false }]);
    expect(divergence.items.find((item) => item.id === 'I1')).toMatchObject({ itemStatus: 'not_delivered' });
    expect(divergence.stops.find((stop) => stop.id === 'S1')).toMatchObject({ status: 'with_divergence' });
  });
  it('as funções não alteram a viagem original', () => {
    const original = trip();
    applyChecked(original, 'I1');
    expect(original.items[0]!.itemStatus).toBe('planned');
  });
  it('item ou parada desconhecidos não mudam nada', () => {
    expect(applyChecked(trip(), 'XX')).toEqual(trip());
    expect(applyArrived(trip(), 'XX', '2026-10-12T12:30:00Z')).toEqual(trip());
  });
});

describe('stopItems', () => {
  it('os itens de uma parada', () => {
    expect(stopItems(trip(), 'S1').map((item) => item.id)).toEqual(['I1']);
  });
});

describe('settlePending (depois da confirmação do servidor)', () => {
  const none = { itemIds: new Set<string>(), stopIds: new Set<string>() };
  it('tira a marca pendente do que não tem mais nada na fila e mantém o estado', () => {
    const next = settlePending(applyArrived(applyChecked(trip(), 'I1'), 'S1', '2026-10-12T12:30:00Z'), none);
    expect(next.items[0]).toMatchObject({ itemStatus: 'checked' });
    expect(next.items[0]!.pending).toBeUndefined();
    expect(next.stops[0]).toMatchObject({ status: 'on_site' });
    expect(next.stops[0]!.pending).toBeUndefined();
  });
  it('o que ainda tem operação na fila continua pendente', () => {
    const next = settlePending(applyChecked(trip(), 'I1'), { itemIds: new Set(['I1']), stopIds: new Set() });
    expect(next.items[0]!.pending).toBe(true);
  });
  it('não altera a viagem original', () => {
    const original = applyChecked(trip(), 'I1');
    settlePending(original, none);
    expect(original.items[0]!.pending).toBe(true);
  });
});

describe('revertOptimistic (operação descartada)', () => {
  it('conferência descartada volta o cilindro a planejado', () => {
    expect(revertOptimistic(applyChecked(trip(), 'I1'), 'trip.check_item', { itemId: 'I1' }).items[0]).toMatchObject({ itemStatus: 'planned' });
    expect(revertOptimistic(applyChecked(trip(), 'I1'), 'trip.check_item', { itemId: 'I1' }).items[0]!.pending).toBeUndefined();
  });
  it('desfazer descartado volta o cilindro a conferido', () => {
    expect(revertOptimistic(applyUncheckQueued(trip(), 'I1'), 'trip.uncheck_item', { itemId: 'I1' }).items[0]).toMatchObject({ itemStatus: 'checked' });
  });
  it('chegada descartada volta a parada a pendente, sem horário', () => {
    expect(revertOptimistic(applyArrived(trip(), 'S1', '2026-10-12T12:30:00Z'), 'trip.arrive_stop', { stopId: 'S1' }).stops[0]).toMatchObject({ status: 'pending', arrivedAt: null });
  });
  it('entrega descartada volta os cilindros a em trânsito e a parada a no local', () => {
    const delivered = applyDelivered(applyArrived(trip(), 'S1', '2026-10-12T12:30:00Z'), 'S1', [{ itemId: 'I1', delivered: true }]);
    const next = revertOptimistic(delivered, 'trip.deliver', { stopId: 'S1', itemIds: ['I1'] });
    expect(next.items[0]).toMatchObject({ itemStatus: 'in_transit' });
    expect(next.stops[0]).toMatchObject({ status: 'on_site' });
  });
  it('operação desconhecida ou sem referência não muda nada', () => {
    expect(revertOptimistic(trip(), 'trip.cancel', {})).toEqual(trip());
    expect(revertOptimistic(trip(), 'trip.check_item', {})).toEqual(trip());
  });
});
