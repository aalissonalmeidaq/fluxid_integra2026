import { fail, ok, type Reply } from './mock-registry';
import type { TripOperationContext } from './mock-trips';
import type { TripMock } from './mock-trips';
import { registerAttachmentOperations } from './mock-trips-attachments';
import { itemView, stopView } from './mock-trips-plan';

// Viagem para operar offline do backend simulado (Spec 010, RF-006, RF-007): reproduz `get_trip_offline` de
// specs/010-fila-offline-fotos-assinatura/contracts/operacoes-servidor.md §3, sem recebedor, coordenadas registradas nem anexos. As regras de
// verdade (RLS, estados, sanitização) são provadas no pgTAP; aqui só o formato que o aparelho guarda.

function getTripOffline({ org, body, mock }: TripOperationContext): Reply {
  const trip = mock.tripOf(org, body.trip_id);
  if (!trip) return fail('NOT_FOUND', 404);
  if (trip.status !== 'loading' && trip.status !== 'in_progress') return fail('TRIP_STATE_INVALID', 409, { status: trip.status });
  const vehicle = mock.registry.vehicles.find((candidate) => candidate.id === trip.vehicle_id)!;
  const stops = mock.stopsOf(trip.id).filter((stop) => stop.status !== 'removed').sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const stopIds = new Set(stops.map((stop) => stop.id));
  return ok('OK', {
    fetched_at: mock.now().toISOString(),
    trip: { id: trip.id, number: trip.number, planned_date: trip.planned_date, status: trip.status, version: trip.version },
    vehicle: { plate: vehicle.plate },
    stops: stops.map((stop) => ({ ...stopView(mock, stop), arrival: undefined })),
    items: mock.itemsOf(trip.id).filter((item) => item.item_status !== 'released' && stopIds.has(item.stop_id)).map((item) => {
      const view = itemView(mock, item) as Record<string, unknown>;
      const identifiers = mock.cylinders.identifiers.filter((identifier) => identifier.cylinder_id === item.cylinder_id && identifier.status === 'active').map((identifier) => identifier.value.trim().toUpperCase()).sort();
      return { id: view.id, stop_id: view.stop_id, item_status: view.item_status, lock_status: view.lock_status, cylinder: view.cylinder, identifiers };
    }),
    deliveries: mock.deliveries.filter((delivery) => stopIds.has(delivery.stop_id)).map((delivery) => ({ id: delivery.id, stop_id: delivery.stop_id })),
  });
}

// Decisão sobre um conflito vindo da fila (Spec 010, RF-013): a justificativa de 5 a 500 caracteres vale só no descarte e a decisão fica registrada.
export const resolutions: { requestId: string; decision: string; hasJustification: boolean }[] = [];

function resolveSyncConflict({ body, mock, org }: TripOperationContext): Reply {
  if (!mock.tripOf(org, body.trip_id)) return fail('NOT_FOUND', 404);
  const decision = body.decision;
  if (decision !== 'discard' && decision !== 'resubmit') return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'decision', message: 'Decisão desconhecida.' }] });
  const justification = typeof body.justification === 'string' ? body.justification.replace(/\s+/g, ' ').trim() : '';
  if (decision === 'discard' && (justification.length < 5 || justification.length > 500)) {
    return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'justification', message: 'A justificativa deve ter de 5 a 500 caracteres.' }] });
  }
  resolutions.push({ requestId: String(body.source_request_id), decision, hasJustification: justification.length > 0 });
  return ok('RESOLVED', {});
}

export function registerOfflineOperations(mock: TripMock): void {
  mock.register('resolve_sync_conflict', { kind: 'manage', permission: 'trip.operate', run: resolveSyncConflict });
  registerAttachmentOperations(mock);
  mock.register('get_trip_offline', { kind: 'query', permission: 'trip.operate', run: getTripOffline });
}
