import type { MyDriverTripsView } from '@/application/tracking/trip-tracking-service';

// Última resposta de "Minha viagem" por pessoa e empresa (Spec 015), para a tela e o item do menu abrirem sem conexão no meio da
// viagem. Guarda só número, situação, data, placa e paradas: nada de cliente, endereço ou posição. Qualquer falha do armazenamento
// vira ausência.
export interface MyDriverTripsCache {
  read(userId: string, organizationId: string): { view: MyDriverTripsView; savedAt: string } | null;
  write(userId: string, organizationId: string, view: MyDriverTripsView, savedAt: string): void;
}

const keyOf = (userId: string, organizationId: string) => `fluxid:minha-viagem:${userId}:${organizationId}`;

function isView(value: unknown): value is MyDriverTripsView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Record<string, unknown>;
  return typeof view.isDriver === 'boolean' && Array.isArray(view.trips) && view.trips.every((trip) => {
    const t = trip as Record<string, unknown> | null;
    return t !== null && typeof t === 'object' && typeof t.id === 'string' && typeof t.number === 'number' && typeof t.status === 'string'
      && typeof t.plannedDate === 'string' && typeof t.vehiclePlate === 'string' && typeof t.stopCount === 'number'
      && (t.startedAt === null || typeof t.startedAt === 'string');
  });
}

export function createMyDriverTripsCache(storage: Storage | null = typeof localStorage === 'undefined' ? null : localStorage): MyDriverTripsCache {
  return {
    read(userId, organizationId) {
      try {
        const raw = storage?.getItem(keyOf(userId, organizationId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { view?: unknown; savedAt?: unknown };
        return isView(parsed.view) && typeof parsed.savedAt === 'string' ? { view: parsed.view, savedAt: parsed.savedAt } : null;
      } catch {
        return null;
      }
    },
    write(userId, organizationId, view, savedAt) {
      try {
        storage?.setItem(keyOf(userId, organizationId), JSON.stringify({ view, savedAt }));
      } catch {
        // Armazenamento cheio ou bloqueado: a tela segue com a resposta do servidor.
      }
    },
  };
}
