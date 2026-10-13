// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseOfflineTrip } from '@/domain/field/offline-trip';
import { summarizeConflict } from './conflict-summary';
import type { OutboxItem } from '@/infrastructure/synchronization/sync-outbox';

const trip = parseOfflineTrip({
  code: 'OK', fetched_at: '2026-10-12T11:59:00Z', trip: { id: 'T1', number: 7, planned_date: '2026-10-12', status: 'in_progress', version: 3 }, vehicle: { plate: 'OFT1001' },
  stops: [{ id: 'S2', position: 2, status: 'pending', arrived_at: null, site: { id: 'U2', name: 'Unidade 2', city: 'São Paulo', state: 'SP', customer_name: 'Hospital Alfa' } }],
  items: [{ id: 'I1', stop_id: 'S2', item_status: 'in_transit', lock_status: 'none', cylinder: { id: 'C1', serial_number: 'OFT-001', gas: 'Oxigênio', capacity_value: 10, capacity_unit: 'l' }, identifiers: [] }],
  deliveries: [],
});
const item = (operation: string, payload: Record<string, unknown>): OutboxItem => ({
  id: 'o1', idempotency_key: 'k', organization_id: 'tenant-a', actor_id: 'u1', device_id: 'd', operation, payload, version: 1, dependencies: [], local_timestamp: '2026-10-12T12:00:00.000Z',
  endpoint_id: 'local', trip_id: 'T1', queued_at: '2026-10-12T12:00:00.000Z', server_timestamp: null, status: 'conflict', attempt_count: 0, failure_reason: 'TRIP_CLOSED',
  created_at: '2026-10-12T12:00:00.000Z', updated_at: '2026-10-12T12:00:00.000Z',
});

// Spec 010, T039/T041 (RF-012, RF-025): o resumo do conflito diz o que foi feito, sem nenhum dado sensível (posição, recebedor, valores lidos).
describe('summarizeConflict', () => {
  it('conferência: operação, número de série e hora', () => {
    expect(summarizeConflict(item('trip.check_item', { trip_id: 'T1', item_id: 'I1', source: 'camera' }), trip)).toEqual({ operation: 'trip.check_item', serial: 'OFT-001', queuedAt: '2026-10-12T12:00:00.000Z' });
  });

  it('chegada: a posição da parada e se a posição foi informada, nunca as coordenadas', () => {
    const summary = summarizeConflict(item('trip.arrive_stop', { trip_id: 'T1', stop_id: 'S2', latitude: -23.55, longitude: -46.633, position_source: 'gps' }), trip);
    expect(summary).toEqual({ operation: 'trip.arrive_stop', stopPosition: 2, queuedAt: '2026-10-12T12:00:00.000Z', positionInformed: true });
    expect(JSON.stringify(summary)).not.toMatch(/-23|-46|gps/);
  });

  it('entrega: se houve posição e recebedor informados, nunca os valores', () => {
    const summary = summarizeConflict(item('trip.deliver', { trip_id: 'T1', stop_id: 'S2', recipient_name: 'Recebedor Sigiloso', latitude: -23.55, longitude: -46.633, results: [{ item_id: 'I1', delivered: true, source: 'nfc' }] }), trip);
    expect(summary).toEqual({ operation: 'trip.deliver', stopPosition: 2, queuedAt: '2026-10-12T12:00:00.000Z', positionInformed: true, recipientInformed: true });
    expect(JSON.stringify(summary)).not.toMatch(/Sigiloso|-23|nfc/);
  });

  it('entrega sem posição nem recebedor informados (endereço da unidade)', () => {
    expect(summarizeConflict(item('trip.deliver', { trip_id: 'T1', stop_id: 'S2', at_site_address: true, results: [] }), trip)).toMatchObject({ positionInformed: false });
  });

  it('sem a viagem guardada, descreve só a operação e a hora', () => {
    expect(summarizeConflict(item('trip.check_item', { trip_id: 'T1', item_id: 'I1' }), null)).toEqual({ operation: 'trip.check_item', queuedAt: '2026-10-12T12:00:00.000Z' });
  });
});
