import type { OfflineItem, OfflineTrip } from '@/domain/field/offline-trip';
import type { ItemStatus, StopStatus } from '@/domain/trips/trip-vocabulary';
import type { TripDetail, TripItemView } from './trip-views';

// A cópia guardada no aparelho (Spec 010, RF-006) vestida como o detalhe da viagem, para a tela abrir sem chamar o servidor. O que a cópia não
// guarda (motorista, licenciamento, recebedor, coordenadas, anexos) fica vazio e `offline: true` avisa a tela para não mostrá-lo.
const ITEM_STATUSES: readonly ItemStatus[] = ['planned', 'checked', 'in_transit', 'delivered', 'not_delivered', 'removed', 'released', 'returned'];
const STOP_STATUSES: readonly StopStatus[] = ['pending', 'on_site', 'delivered', 'with_divergence', 'removed'];

const custodyOf = (status: ItemStatus): TripItemView['cylinder']['custodyStatus'] =>
  status === 'in_transit' ? 'in_transit' : status === 'delivered' ? 'at_customer' : 'in_organization';

function toItem(item: OfflineItem): TripItemView {
  const itemStatus = ITEM_STATUSES.find((candidate) => candidate === item.itemStatus) ?? 'planned';
  return {
    id: item.id,
    stopId: item.stopId,
    itemStatus,
    lockStatus: item.lockStatus === 'locked' || item.lockStatus === 'unlocked' ? item.lockStatus : 'none',
    checkedAt: null,
    checkedByName: null,
    divergenceReason: null,
    offline: true,
    identifiers: item.identifiers,
    ...(item.pending ? { pending: true } : {}),
    cylinder: {
      id: item.cylinder.id, serialNumber: item.cylinder.serialNumber, gas: item.cylinder.gas, capacityValue: item.cylinder.capacityValue ?? 0,
      capacityUnit: item.cylinder.capacityUnit, status: 'active', stockStatus: 'in_stock', custodyStatus: custodyOf(itemStatus), hydroStatus: 'sem_teste',
    },
  };
}

export function offlineTripToDetail(trip: OfflineTrip): TripDetail {
  return {
    offline: true,
    trip: {
      id: trip.id, number: trip.number, plannedDate: trip.plannedDate, status: trip.status, notes: null, cancelReason: null, version: trip.version,
      createdAt: trip.fetchedAt, createdByName: null, startedAt: null, completedAt: null, cancelledAt: null,
    },
    overdue: false,
    vehicle: { id: '', plate: trip.vehiclePlate, capacityCylinders: 0, status: 'available', licensingDueOn: null, licensingStatus: 'sem_data' },
    driver: { id: '', fullName: '', status: 'active', cnhValidUntil: '', cnhStatus: 'sem_data' },
    stops: trip.stops.map((stop) => ({
      id: stop.id, position: stop.position, status: STOP_STATUSES.find((candidate) => candidate === stop.status) ?? 'pending', arrivedAt: stop.arrivedAt, outOfOrder: false, closedAt: null, ...(stop.pending ? { pending: true } : {}),
      site: { ...stop.site, customerId: '' },
    })),
    items: trip.items.map(toItem),
    deliveries: [],
    knownDeliveries: trip.deliveries.map((delivery) => ({ id: delivery.id, stopId: delivery.stopId })),
    unlocks: [],
    warnings: [],
  };
}
