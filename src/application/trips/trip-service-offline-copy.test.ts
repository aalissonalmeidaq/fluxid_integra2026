import { describe, expect, it, vi } from 'vitest';
import type { OfflineTrip } from '@/domain/field/offline-trip';
import { TripService, type OfflineTripPort, type TripTransport } from './trip-service';

// Spec 010, T023 (RF-006, RF-007): sem conexão a viagem abre da cópia guardada, sem chamar o servidor; com conexão a cópia é gravada e renovada.
const ORG = '20000000-0000-4000-8000-00000000000a';
const copy: OfflineTrip = {
  id: 'T1', number: 7, plannedDate: '2026-10-20', status: 'loading', version: 3, vehiclePlate: 'ABC1234', fetchedAt: '2026-10-12T10:00:00Z', deliveries: [],
  stops: [{ id: 'S1', position: 1, status: 'pending', arrivedAt: null, site: { id: 'U1', name: 'Unidade Central', city: 'São Paulo', state: 'SP', customerName: 'Alfa Saúde' } }],
  items: [{ id: 'I1', stopId: 'S1', itemStatus: 'checked', lockStatus: 'none', pending: true, identifiers: ['QR-1'], cylinder: { id: 'C1', serialNumber: 'CIL-001', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l' } }],
};
const transport = (response: { status: number; body: unknown }): TripTransport & { call: ReturnType<typeof vi.fn> } => ({ call: vi.fn(async () => response) }) as never;
const port = (stored: OfflineTrip | null): OfflineTripPort & { get: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> } =>
  ({ get: vi.fn(async () => stored), save: vi.fn(async () => stored) }) as never;

describe('viagem guardada no aparelho', () => {
  it('sem conexão abre da cópia, marcada como offline, sem chamar o servidor', async () => {
    const t = transport({ status: 200, body: {} });
    const outcome = await new TripService(t, () => false, undefined, undefined, port(copy)).getTrip(ORG, 'T1');
    expect(t.call).not.toHaveBeenCalled();
    expect(outcome.kind).toBe('success');
    if (outcome.kind !== 'success') return;
    expect(outcome.value).toMatchObject({ offline: true, trip: { id: 'T1', number: 7, status: 'loading' }, vehicle: { plate: 'ABC1234' } });
    expect(outcome.value.items[0]).toMatchObject({ id: 'I1', itemStatus: 'checked', offline: true, cylinder: { serialNumber: 'CIL-001' } });
    expect(outcome.value.stops[0]?.site.name).toBe('Unidade Central');
  });

  it('sem conexão e sem cópia devolve "offline"', async () => {
    const outcome = await new TripService(transport({ status: 200, body: {} }), () => false, undefined, undefined, port(null)).getTrip(ORG, 'T1');
    expect(outcome).toEqual({ kind: 'offline' });
  });

  it('sem a porta, o comportamento da Spec 008 não muda', async () => {
    const outcome = await new TripService(transport({ status: 200, body: {} }), () => false).getTrip(ORG, 'T1');
    expect(outcome).toEqual({ kind: 'offline' });
  });

  it('com conexão grava a cópia de get_trip_offline, preservando o que ainda está na fila', async () => {
    const body = { code: 'OK', trip: { id: 'T1' } };
    const t = transport({ status: 200, body });
    const store = port(null);
    const refs = { itemIds: new Set(['I1']), stopIds: new Set<string>() };
    await new TripService(t, () => true, { enqueue: vi.fn(), pendingRefs: vi.fn(async () => refs) } as never, undefined, store).rememberTrip(ORG, 'T1');
    expect(t.call).toHaveBeenCalledWith('query-trips', { operation: 'get_trip_offline', organization_id: ORG, trip_id: 'T1' });
    expect(store.save).toHaveBeenCalledWith(body, { pendingItemIds: refs.itemIds, pendingStopIds: refs.stopIds });
  });

  it('falha ao guardar (sem permissão, rede, viagem encerrada) não derruba a tela', async () => {
    const store = port(null);
    await expect(new TripService(transport({ status: 403, body: { code: 'ACCESS_DENIED' } }), () => true, undefined, undefined, store).rememberTrip(ORG, 'T1')).resolves.toBeUndefined();
    expect(store.save).not.toHaveBeenCalled();
    const broken = { call: vi.fn(async () => { throw new Error('x'); }) } as unknown as TripTransport;
    await expect(new TripService(broken, () => true, undefined, undefined, store).rememberTrip(ORG, 'T1')).resolves.toBeUndefined();
  });

  it('sem conexão, rememberTrip não faz nada', async () => {
    const t = transport({ status: 200, body: {} });
    await new TripService(t, () => false, undefined, undefined, port(null)).rememberTrip(ORG, 'T1');
    expect(t.call).not.toHaveBeenCalled();
  });
});
