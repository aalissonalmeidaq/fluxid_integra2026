import type { TripDeliveryView } from '@/application/trips/trip-views';

// Registro vigente da parada: o mais recente que ninguém corrigiu. Os anteriores ficam no histórico (RF-015).
export function currentDelivery(deliveries: readonly TripDeliveryView[]): TripDeliveryView | null {
  const superseded = new Set(deliveries.map((delivery) => delivery.supersedesId).filter((id): id is string => id !== null));
  const live = deliveries.filter((delivery) => !superseded.has(delivery.id));
  return live.length === 0 ? null : [...live].sort((x, y) => x.recordedAt.localeCompare(y.recordedAt)).at(-1) ?? null;
}
