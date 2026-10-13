import { parseOfflineTrip, type OfflineTrip } from '@/domain/field/offline-trip';
import type { LocalDatabase, LocalRecord, RecordOwner } from '@/infrastructure/local-database/local-database';

// A viagem guardada no aparelho (Spec 010, RF-006, RF-007; data-model.md §2.3): a cópia de leitura que permite operar sem conexão. Fica em
// `local_trips`, por conta, organização e destino. Nada sensível entra: `parseOfflineTrip` tem lista fechada de campos (sem recebedor,
// coordenadas registradas, anexos nem motorista). Quem sai da conta remove a cópia; a fila e os anexos pendentes **não** são tocados aqui.
export interface OfflineTripOwner extends RecordOwner {
  organizationId: string;
}

interface TripRecord extends LocalRecord {
  actor_id: string;
  endpoint_id: string;
  trip_id: string;
  snapshot: OfflineTrip;
  fetched_at: string;
  updated_at: string;
}

export interface SaveOptions {
  // Itens e paradas com mudança ainda na fila: a abertura online não pode desfazer o que a pessoa já registrou e ainda não foi enviado.
  pendingItemIds?: ReadonlySet<string>;
  pendingStopIds?: ReadonlySet<string>;
}

export class OfflineTripStore {
  constructor(
    private readonly database: LocalDatabase,
    private readonly owner: OfflineTripOwner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Um registro por conta e destino: duas contas no mesmo aparelho guardam cada uma a sua cópia da mesma viagem.
  private recordId(tripId: string): string {
    return `${this.owner.actorId}|${this.owner.endpointId}|${tripId}`;
  }

  // Corpo de `get_trip_offline` -> cópia guardada. Nulo quando o corpo não é uma viagem que serve para operar offline.
  async save(raw: unknown, options: SaveOptions = {}): Promise<OfflineTrip | null> {
    const fresh = parseOfflineTrip(raw);
    if (!fresh) return null;
    let snapshot = fresh;
    if ((options.pendingItemIds?.size ?? 0) > 0 || (options.pendingStopIds?.size ?? 0) > 0) {
      const previous = await this.get(fresh.id);
      if (previous) snapshot = keepPending(fresh, previous, options);
    }
    await this.write(snapshot);
    return snapshot;
  }

  async get(tripId: string): Promise<OfflineTrip | null> {
    const record = (await this.owned()).find((candidate) => candidate.trip_id === tripId);
    return record ? record.snapshot : null;
  }

  async list(): Promise<OfflineTrip[]> {
    return (await this.owned()).map((record) => record.snapshot);
  }

  // Grava uma mudança otimista (por exemplo, "conferido, pendente de envio"). Nada é confirmado aqui.
  async update(tripId: string, change: (trip: OfflineTrip) => OfflineTrip): Promise<OfflineTrip | null> {
    const current = await this.get(tripId);
    if (!current) return null;
    const next = change(current);
    await this.write(next);
    return next;
  }

  async remove(tripId: string): Promise<void> {
    await this.database.delete('local_trips', this.recordId(tripId));
  }

  // Ao sair da conta: só as cópias deste dono; a fila e os anexos pendentes ficam.
  async removeAll(): Promise<void> {
    for (const record of await this.owned()) await this.database.delete('local_trips', record.id);
  }

  // Viagem encerrada no servidor: a cópia só sai se não restar nada pendente dela na fila.
  async removeIfClosed(tripId: string, hasPending: boolean): Promise<boolean> {
    if (hasPending) return false;
    await this.remove(tripId);
    return true;
  }

  private async owned(): Promise<TripRecord[]> {
    return (await this.database.listOwned('local_trips', this.owner)) as TripRecord[];
  }

  private async write(snapshot: OfflineTrip): Promise<void> {
    const record: TripRecord = {
      id: this.recordId(snapshot.id),
      organization_id: this.owner.organizationId,
      actor_id: this.owner.actorId,
      endpoint_id: this.owner.endpointId,
      trip_id: snapshot.id,
      snapshot,
      fetched_at: snapshot.fetchedAt,
      updated_at: this.now().toISOString(),
    };
    await this.database.put('local_trips', record);
  }
}

// Reaplica sobre a cópia nova o que ainda está só no aparelho.
function keepPending(fresh: OfflineTrip, previous: OfflineTrip, options: SaveOptions): OfflineTrip {
  const items = fresh.items.map((item) => {
    const local = previous.items.find((candidate) => candidate.id === item.id);
    return local?.pending && options.pendingItemIds?.has(item.id) ? { ...item, itemStatus: local.itemStatus, pending: true } : item;
  });
  const stops = fresh.stops.map((stop) => {
    const local = previous.stops.find((candidate) => candidate.id === stop.id);
    return local?.pending && options.pendingStopIds?.has(stop.id) ? { ...stop, status: local.status, arrivedAt: local.arrivedAt, pending: true } : stop;
  });
  return { ...fresh, items, stops };
}
