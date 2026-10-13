import type { AttachmentView } from '@/application/field/attachment-service';
import type { OfflineTrip } from '@/domain/field/offline-trip';
import { conflictReasonText, hasOldPending, itemStatusLabel, operationLabel, type ItemStatus } from '@/domain/field/sync-status';
import type { OutboxItem } from '@/infrastructure/synchronization/sync-outbox';

// A lista da tela Sincronização (Spec 010, RF-004, RF-030; contracts/telas-e-fluxos.md §2): itens abertos da fila agrupados por viagem, cada um
// em texto, com a hora do aparelho e o estado. Só sai daqui texto sem dado sensível: o corpo do pedido (recebedor, posição, valor lido) nunca é copiado.
export interface SyncRow {
  id: string;
  label: string;
  queuedAt: string;
  status: string;
  rawStatus: ItemStatus;
  // Sem confirmação do servidor há mais de 24 horas.
  old: boolean;
  // Motivo em texto (conflito ou falha); ausente nos demais.
  reason?: string;
}

// Fotos e assinatura guardadas no aparelho de uma viagem: o resumo em texto e os anexos recusados, que a pessoa pode remover.
export interface SyncAttachments {
  text: string;
  failed: { id: string; label: string; reason: string }[];
}

export interface SyncGroup {
  tripId: string;
  title: string;
  rows: SyncRow[];
  attachments?: SyncAttachments;
}

const OPEN = new Set<string>(['pending', 'syncing', 'conflict', 'failed']);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

function summarizeAttachments(list: readonly AttachmentView[]): SyncAttachments {
  const waiting = list.filter((entry) => entry.status !== 'failed');
  const photos = waiting.filter((entry) => entry.kind === 'photo').length;
  const signature = waiting.some((entry) => entry.kind === 'signature');
  const parts = [photos > 0 ? plural(photos, 'foto', 'fotos') : null, signature ? 'assinatura' : null].filter((part): part is string => part !== null);
  const text = parts.length === 0 ? '' : `${parts.join(' e ')} ${photos + (signature ? 1 : 0) === 1 ? 'pendente' : 'pendentes'}`;
  const failed = list.filter((entry) => entry.status === 'failed').map((entry) => ({
    id: entry.id, label: entry.kind === 'signature' ? 'Assinatura' : `Foto ${entry.position}`, reason: entry.failureText ?? 'O servidor recusou este anexo.',
  }));
  return { text, failed };
}

export function buildSyncOverview(items: readonly OutboxItem[], trips: readonly OfflineTrip[], now: Date, attachments: readonly AttachmentView[] = []): SyncGroup[] {
  const groups = new Map<string, SyncGroup>();
  const ordered = items.filter((item) => OPEN.has(item.status)).sort((a, b) => a.queued_at.localeCompare(b.queued_at) || a.id.localeCompare(b.id));
  for (const item of ordered) {
    const tripId = item.trip_id ?? '';
    const trip = trips.find((candidate) => candidate.id === tripId);
    const itemId = text(item.payload.item_id);
    const stopId = text(item.payload.stop_id);
    const serial = trip?.items.find((entry) => entry.id === itemId)?.cylinder.serialNumber;
    const stopPosition = trip?.stops.find((stop) => stop.id === stopId)?.position ?? undefined;
    const status = item.status as ItemStatus;
    const row: SyncRow = {
      id: item.id,
      label: operationLabel(item.operation, { ...(serial !== undefined ? { serial } : {}), ...(stopPosition !== undefined ? { stopPosition } : {}) }),
      queuedAt: item.queued_at,
      status: itemStatusLabel(status),
      rawStatus: status,
      old: (status === 'pending' || status === 'failed') && hasOldPending(item.queued_at, now),
      ...((status === 'conflict' || status === 'failed') && item.failure_reason ? { reason: conflictReasonText(item.failure_reason) } : {}),
    };
    const group = groups.get(tripId) ?? { tripId, title: trip ? `Viagem n.º ${trip.number}` : 'Viagem', rows: [] };
    group.rows.push(row);
    groups.set(tripId, group);
  }
  // Os anexos aparecem na viagem a que pertencem, mesmo quando o registro da entrega já foi enviado e só eles restam.
  for (const tripId of new Set(attachments.map((entry) => entry.tripId))) {
    const trip = trips.find((candidate) => candidate.id === tripId);
    const group = groups.get(tripId) ?? { tripId, title: trip ? `Viagem n.º ${trip.number}` : 'Viagem', rows: [] };
    group.attachments = summarizeAttachments(attachments.filter((entry) => entry.tripId === tripId));
    groups.set(tripId, group);
  }
  return [...groups.values()];
}
