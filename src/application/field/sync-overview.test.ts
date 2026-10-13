import { describe, expect, it } from 'vitest';
import type { OfflineTrip } from '@/domain/field/offline-trip';
import type { OutboxItem } from '@/infrastructure/synchronization/sync-outbox';
import { buildSyncOverview } from './sync-overview';

// Spec 010, T028 (RF-004, RF-030): a lista da tela Sincronização, por viagem, só com texto sem dado sensível.
const NOW = new Date('2026-10-13T12:00:00Z');
const trip: OfflineTrip = {
  id: 'T1', number: 7, plannedDate: '2026-10-13', status: 'in_progress', version: 1, vehiclePlate: 'ABC1234', fetchedAt: '2026-10-13T08:00:00Z', deliveries: [],
  stops: [{ id: 'S1', position: 2, status: 'pending', arrivedAt: null, site: { id: 'U', name: 'Unidade', city: 'X', state: 'SP', customerName: 'C' } }],
  items: [{ id: 'I1', stopId: 'S1', itemStatus: 'planned', lockStatus: 'none', identifiers: [], cylinder: { id: 'C1', serialNumber: 'CIL-001', gas: 'O2', capacityValue: 10, capacityUnit: 'l' } }],
};
const item = (over: Partial<OutboxItem>): OutboxItem => ({
  id: 'q1', idempotency_key: 'k1', organization_id: 'o', actor_id: 'a', device_id: 'd', operation: 'trip.check_item', payload: { trip_id: 'T1', item_id: 'I1', recipient_name: 'Fictício' },
  version: 1, dependencies: [], local_timestamp: '', endpoint_id: 'e', trip_id: 'T1', queued_at: '2026-10-13T11:00:00Z', server_timestamp: null, status: 'pending', attempt_count: 0,
  failure_reason: null, created_at: '', updated_at: '', ...over,
} as OutboxItem);

describe('visão geral da fila', () => {
  it('agrupa por viagem, descreve cada operação em texto e usa o número da viagem e o série do cilindro', () => {
    const overview = buildSyncOverview([item({}), item({ id: 'q2', operation: 'trip.arrive_stop', payload: { trip_id: 'T1', stop_id: 'S1' }, queued_at: '2026-10-13T11:05:00Z' })], [trip], NOW);
    expect(overview).toHaveLength(1);
    expect(overview[0]?.title).toBe('Viagem n.º 7');
    expect(overview[0]?.rows.map((row) => row.label)).toEqual(['Conferência do cilindro CIL-001', 'Chegada à parada 2']);
    expect(overview[0]?.rows[0]).toMatchObject({ status: 'Pendente', old: false });
  });

  it('não vaza dado sensível do corpo do pedido', () => {
    const overview = buildSyncOverview([item({ operation: 'trip.deliver', payload: { trip_id: 'T1', stop_id: 'S1', recipient_name: 'Nome Fictício', latitude: -23.5 } })], [trip], NOW);
    expect(JSON.stringify(overview)).not.toMatch(/Nome Fictício|23\.5/);
  });

  it('destaca o que está sem confirmação há mais de 24 horas e mostra o motivo do conflito em texto', () => {
    const [group] = buildSyncOverview([
      item({ queued_at: '2026-10-12T09:00:00Z' }),
      item({ id: 'q2', status: 'conflict', failure_reason: 'TRIP_CLOSED' }),
    ], [trip], NOW);
    expect(group?.rows[0]).toMatchObject({ old: true });
    expect(group?.rows[1]).toMatchObject({ status: 'Conflito', reason: 'A viagem foi encerrada depois que você registrou isto.' });
  });

  it('itens enviados ou descartados não aparecem; viagem sem cópia usa um título genérico', () => {
    const overview = buildSyncOverview([item({ status: 'synced' }), item({ id: 'q3', trip_id: 'T9', payload: { trip_id: 'T9' } })], [trip], NOW);
    expect(overview).toHaveLength(1);
    expect(overview[0]?.title).toBe('Viagem');
    expect(overview[0]?.rows[0]?.label).toBe('Conferência do cilindro');
  });

  it('fila vazia devolve lista vazia', () => {
    expect(buildSyncOverview([], [], NOW)).toEqual([]);
  });
});

// Spec 010, T028 (RF-021, RF-026): fotos e assinatura pendentes aparecem na viagem, em texto; os recusados dizem o motivo.
describe('anexos na visão geral', () => {
  const anexo = (over: Record<string, unknown>) => ({
    id: 'a1', tripId: 'T1', kind: 'photo', position: 1, status: 'pending', sizeBytes: 10, capturedAt: '2026-10-13T11:00:00Z', outboxItemId: 'q1', deliveryId: null, addedLater: false, failureText: null, ...over,
  }) as never;

  it('resume "2 fotos e assinatura pendentes" na viagem', () => {
    const [group] = buildSyncOverview([item({})], [trip], NOW, [anexo({ id: 'a1' }), anexo({ id: 'a2', position: 2 }), anexo({ id: 'a3', kind: 'signature', position: 0 })]);
    expect(group?.attachments?.text).toBe('2 fotos e assinatura pendentes');
  });

  it('uma foto usa o singular', () => {
    const [group] = buildSyncOverview([], [trip], NOW, [anexo({})]);
    expect(group?.attachments?.text).toBe('1 foto pendente');
    expect(group?.title).toBe('Viagem n.º 7');
    expect(group?.rows).toEqual([]);
  });

  it('o anexo recusado diz o motivo e pode ser removido; não conta como pendente', () => {
    const [group] = buildSyncOverview([], [trip], NOW, [anexo({ status: 'failed', failureText: 'O prazo para acrescentar anexos a esta entrega terminou.' })]);
    expect(group?.attachments).toEqual({ text: '', failed: [{ id: 'a1', label: 'Foto 1', reason: 'O prazo para acrescentar anexos a esta entrega terminou.' }] });
  });

  it('sem anexos, nada muda', () => {
    expect(buildSyncOverview([item({})], [trip], NOW)[0]?.attachments).toBeUndefined();
  });
});
