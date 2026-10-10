import { vi } from 'vitest';
import type { TripService } from '@/application/trips/trip-service';
import type { EligibleCylinderView, TripDetail, TripListItem, TripOptions } from '@/application/trips/trip-views';

// Massa e serviço falso compartilhados pelos testes das telas de viagem. Dados fictícios.
export const ORG = '20000000-0000-4000-8000-00000000000a';
export const TRIP = '99000000-0000-4000-8000-000000000001';
export const VEHICLE = '95000000-0000-4000-8000-000000000001';
export const DRIVER = '96000000-0000-4000-8000-000000000001';
export const SITE_1 = '92000000-0000-4000-8000-000000000001';
export const SITE_2 = '92000000-0000-4000-8000-000000000002';
export const STOP_1 = '9a000000-0000-4000-8000-000000000001';

export const options = (over: Partial<TripOptions> = {}): TripOptions => ({
  vehicles: [{ id: VEHICLE, plate: 'ABC1234', capacityCylinders: 3, licensingDueOn: '2027-01-31', licensingStatus: 'em_dia' }],
  drivers: [{ id: DRIVER, fullName: 'Motorista Alfa', cnhValidUntil: '2030-01-01', cnhStatus: 'em_dia' }],
  sites: [
    { id: SITE_1, name: 'Unidade Central', city: 'São Paulo', state: 'SP', customerId: 'c1', customerName: 'Alfa Saúde' },
    { id: SITE_2, name: 'Unidade Norte', city: 'Santos', state: 'SP', customerId: 'c2', customerName: 'Beta Clínica' },
  ],
  ...over,
});

export const cylinder = (n: number, over: Partial<EligibleCylinderView> = {}): EligibleCylinderView => ({
  id: `98000000-0000-4000-8000-00000000000${n}`, serialNumber: `CIL-00${n}`, gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', hydroStatus: 'em_dia', ...over,
});

export const detail = (over: Partial<TripDetail> = {}): TripDetail => ({
  trip: { id: TRIP, number: 7, plannedDate: '2026-10-20', status: 'planned', notes: 'Levar rampa', cancelReason: null, version: 2, createdAt: '2026-10-09T13:00:00Z', createdByName: 'Ana', startedAt: null, completedAt: null, cancelledAt: null },
  overdue: false,
  vehicle: { id: VEHICLE, plate: 'ABC1234', capacityCylinders: 3, status: 'available', licensingDueOn: '2027-01-31', licensingStatus: 'em_dia' },
  driver: { id: DRIVER, fullName: 'Motorista Alfa', status: 'active', cnhValidUntil: '2030-01-01', cnhStatus: 'em_dia' },
  stops: [{ id: STOP_1, position: 1, status: 'pending', arrivedAt: null, outOfOrder: false, closedAt: null, site: { id: SITE_1, name: 'Unidade Central', city: 'São Paulo', state: 'SP', customerId: 'c1', customerName: 'Alfa Saúde' } }],
  items: [
    { id: 'i1', stopId: STOP_1, itemStatus: 'planned', lockStatus: 'none', checkedAt: null, checkedByName: null, divergenceReason: null,
      cylinder: { id: cylinder(1).id, serialNumber: 'CIL-001', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', status: 'active', stockStatus: 'in_stock', custodyStatus: 'in_organization', hydroStatus: 'em_dia' } },
    { id: 'i2', stopId: STOP_1, itemStatus: 'planned', lockStatus: 'none', checkedAt: null, checkedByName: null, divergenceReason: null,
      cylinder: { id: cylinder(2).id, serialNumber: 'CIL-002', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', status: 'active', stockStatus: 'in_stock', custodyStatus: 'in_organization', hydroStatus: 'a_vencer' } },
  ],
  deliveries: [], unlocks: [], warnings: [], ...over,
});

export const listItem = (over: Partial<TripListItem> = {}): TripListItem => ({
  id: TRIP, number: 7, plannedDate: '2026-10-20', status: 'planned', version: 2, overdue: false, vehicle: { id: VEHICLE, plate: 'ABC1234' }, driver: { id: DRIVER, fullName: 'Motorista Alfa' },
  stops: 1, cylinders: 2, divergences: 0, ...over,
});

export function fakeTripService(overrides: Record<string, unknown> = {}) {
  return {
    tripOptions: vi.fn(async () => ({ kind: 'success' as const, value: options() })),
    getTrip: vi.fn(async () => ({ kind: 'success' as const, value: detail() })),
    listEligibleCylinders: vi.fn(async () => ({ kind: 'success' as const, value: { items: [cylinder(1), cylinder(2), cylinder(3)], next: null } })),
    createTrip: vi.fn(async () => ({ kind: 'success' as const, value: { tripId: TRIP, number: 7, version: 1 } })),
    updateTrip: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3 } })),
    listTrips: vi.fn(async () => ({ kind: 'success' as const, value: { items: [listItem(), listItem({ id: 'outra', number: 8, overdue: true, status: 'loading' })], total: 2, next: null } })),
    registerUnlock: vi.fn(async () => ({ kind: 'success' as const, value: { exceptional: false } })),
    completeTrip: vi.fn(async () => ({ kind: 'success' as const, value: { version: 4 } })),
    cancelTrip: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3, released: 2, inTransit: 0 } })),
    returnItem: vi.fn(async () => ({ kind: 'success' as const, value: true as const })),
    startLoading: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3 } })),
    revertLoading: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3 } })),
    startTrip: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3 } })),
    checkItem: vi.fn(async () => ({ kind: 'success' as const, value: { checked: 1, total: 2 } })),
    uncheckItem: vi.fn(async () => ({ kind: 'success' as const, value: { checked: 0, total: 2 } })),
    removeItem: vi.fn(async () => ({ kind: 'success' as const, value: { checked: 0, total: 1 } })),
    arriveStop: vi.fn(async () => ({ kind: 'success' as const, value: { outOfOrder: false } })),
    registerDelivery: vi.fn(async () => ({ kind: 'success' as const, value: { deliveryId: 'd1', stopStatus: 'delivered' as const, outsideGeofence: null } })),
    tripHistory: vi.fn(async () => ({ kind: 'success' as const, value: { events: [], next: null } })),
    tripsOfCylinder: vi.fn(async () => ({ kind: 'success' as const, value: { items: [], next: null } })),
    tripsOfSite: vi.fn(async () => ({ kind: 'success' as const, value: { items: [], next: null } })),
    ...overrides,
  } as unknown as TripService & Record<'tripOptions' | 'getTrip' | 'listEligibleCylinders' | 'createTrip' | 'updateTrip' | 'listTrips' | 'completeTrip' | 'cancelTrip' | 'returnItem' | 'registerUnlock' | 'startLoading' | 'revertLoading' | 'startTrip' | 'checkItem' | 'uncheckItem' | 'removeItem' | 'arriveStop' | 'registerDelivery' | 'tripHistory' | 'tripsOfCylinder' | 'tripsOfSite', ReturnType<typeof vi.fn>>;
}
