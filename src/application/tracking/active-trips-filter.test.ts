import { describe, expect, it } from 'vitest';
import type { ActiveTripRowView, OriginView } from './tracking-views';
import { filterActiveTrips, isFilterableCounter } from './active-trips-filter';

// Spec 015 (US1, RF-006): cada contador do resumo filtra a lista pela mesma regra que o conta, sem consultar de novo.
const origin = (key: string, freshness: OriginView['freshness']): OriginView => ({ key, origin: 'mobile', subjectId: key, label: key, freshness, position: null });
const row = (tripId: string, freshnesses: OriginView['freshness'][], degraded = false): ActiveTripRowView => ({
  tripId, tripNumber: 1, startedAt: '2026-10-22T12:00:00Z', vehiclePlate: 'AAA', driverName: 'D', openOccurrences: 0,
  degradation: degraded ? { reason: 'foreground_only', since: '2026-10-22T12:00:00Z' } as ActiveTripRowView['degradation'] : null,
  origins: freshnesses.map((freshness, index) => origin(`${tripId}:${index}`, freshness)),
});
const ROWS = [row('a', ['current', 'delayed']), row('b', ['current', 'current'], true), row('c', ['missing'])];

describe('filtro das viagens em andamento pelos contadores', () => {
  it('sem filtro, ou pelo total de viagens, mostra todas', () => {
    expect(filterActiveTrips(ROWS, null)).toHaveLength(3);
    expect(filterActiveTrips(ROWS, 'trips')).toHaveLength(3);
  });

  it('por frescor, mostra as viagens com ao menos uma origem naquele estado', () => {
    expect(filterActiveTrips(ROWS, 'delayed').map((r) => r.tripId)).toEqual(['a']);
    expect(filterActiveTrips(ROWS, 'current').map((r) => r.tripId)).toEqual(['a', 'b']);
    expect(filterActiveTrips(ROWS, 'missing').map((r) => r.tripId)).toEqual(['c']);
  });

  it('por degradação, mostra só as viagens com acompanhamento degradado', () => {
    expect(filterActiveTrips(ROWS, 'degraded').map((r) => r.tripId)).toEqual(['b']);
  });

  it('só os contadores conhecidos filtram', () => {
    expect(isFilterableCounter('delayed')).toBe(true);
    expect(isFilterableCounter('trips')).toBe(false);
    expect(isFilterableCounter('outro')).toBe(false);
  });
});
