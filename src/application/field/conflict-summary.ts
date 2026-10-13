import type { OfflineTrip } from '@/domain/field/offline-trip';
import type { FieldConflictSummary } from '@/infrastructure/synchronization/conflict-resolver';
import type { OutboxItem } from '@/infrastructure/synchronization/sync-outbox';

// Resumo do que a pessoa fez, **sem dado sensível**, para o registro do conflito (Spec 010, RF-012, RF-025): a operação, o número de série do cilindro, a posição
// da parada, a hora do aparelho e só "posição informada" e "recebedor informado" como sim ou não. Coordenadas, nome do recebedor e valores lidos ficam só no
// item da fila.
export function summarizeConflict(item: OutboxItem, trip: OfflineTrip | null): FieldConflictSummary {
  const summary: FieldConflictSummary = { operation: item.operation, queuedAt: item.queued_at };
  if (!trip) return summary;
  const payload = item.payload;
  if (typeof payload.item_id === 'string') {
    const serial = trip.items.find((candidate) => candidate.id === payload.item_id)?.cylinder.serialNumber;
    if (serial) summary.serial = serial;
  }
  if (typeof payload.stop_id === 'string') {
    const position = trip.stops.find((candidate) => candidate.id === payload.stop_id)?.position;
    if (position !== null && position !== undefined) summary.stopPosition = position;
  }
  if (item.operation === 'trip.arrive_stop' || item.operation === 'trip.deliver') {
    summary.positionInformed = payload.latitude != null || payload.position_source != null;
  }
  if (item.operation === 'trip.deliver') summary.recipientInformed = typeof payload.recipient_name === 'string' && payload.recipient_name.length > 0;
  return summary;
}
