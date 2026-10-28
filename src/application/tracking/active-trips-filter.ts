import { FRESHNESS, type Freshness } from '@/domain/tracking/tracking-types';
import type { ActiveTripRowView } from './tracking-views';

// Filtro da lista de viagens em andamento pelos contadores do resumo (Spec 015, US1; RF-006). Usa a mesma regra que conta: uma viagem
// entra no contador de frescor quando ao menos uma origem está naquele estado, e no de degradação quando o acompanhamento está degradado.
// O total de viagens não filtra.
export type CounterFilter = Freshness | 'degraded';

export const isFilterableCounter = (key: string): key is CounterFilter => key === 'degraded' || (FRESHNESS as readonly string[]).includes(key);

export function filterActiveTrips(rows: readonly ActiveTripRowView[], filter: string | null): readonly ActiveTripRowView[] {
  if (!filter || !isFilterableCounter(filter)) return rows;
  if (filter === 'degraded') return rows.filter((row) => row.degradation !== null);
  return rows.filter((row) => row.origins.some((origin) => origin.freshness === filter));
}
