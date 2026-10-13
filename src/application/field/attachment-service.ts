import { canAddPhoto, MAX_PHOTOS, MAX_QUEUE_OPERATIONS, queueUsage, type UsageLevel } from '@/domain/field/attachment-limits';
import type { AttachmentStatus } from '@/domain/field/sync-status';
import type { LocalDatabase, LocalRecord, RecordOwner } from '@/infrastructure/local-database/local-database';

// Anexos da entrega no aparelho (Spec 010, RF-018 a RF-021a, RF-026; contracts/fila-local.md §5 e §7). Foto e assinatura ficam em `local_attachments` até o
// servidor confirmar; só então o registro e os bytes saem do aparelho. O envio vem **depois** do registro da entrega (precisa do `delivery_id` que o servidor
// devolve) e vai um por vez por entrega. O atraso ou a recusa de um anexo **nunca** reverte nem bloqueia a entrega (RN-005). Nada daqui entra em log, URL ou mensagem.
export type AttachmentKind = 'photo' | 'signature';

export interface AttachmentFile {
  id: string;
  bytes: ArrayBuffer;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  capturedAt: string;
}

// A que entrega o anexo pertence: o item da fila (entrega ainda não confirmada) ou uma entrega que o aparelho já conhece, com o que ela já tem no servidor.
export type AttachmentTarget =
  | { outboxItemId: string }
  // `addedLater` (padrão: sim) é falso quando o anexo segue junto do registro da entrega feito com conexão, e verdadeiro no "acrescentar depois".
  | { deliveryId: string; existingPhotos: number; hasSignature: boolean; addedLater?: boolean };

export interface AddRequest {
  tripId: string;
  kind: AttachmentKind;
  file: AttachmentFile;
  target: AttachmentTarget;
}

export type AddRefusal = 'photo_limit' | 'signature_limit' | 'no_space' | 'storage_failed';
export type AddResult = { ok: true; position: number } | { ok: false; reason: AddRefusal; message: string };

export interface UploadInput {
  organizationId: string;
  deliveryId: string;
  attachmentId: string;
  kind: AttachmentKind;
  position: number;
  capturedAt: string;
  sha256: string;
  bytes: ArrayBuffer;
  contentType: string;
  addedLater: boolean;
}

export interface AttachmentUploader {
  upload(input: UploadInput): Promise<{ status: number; body: unknown }>;
}

export interface AttachmentView {
  id: string;
  tripId: string;
  kind: AttachmentKind;
  position: number;
  status: AttachmentStatus;
  sizeBytes: number;
  capturedAt: string;
  outboxItemId: string | null;
  deliveryId: string | null;
  addedLater: boolean;
  failureText: string | null;
}

export interface UploadSummary {
  sent: number;
  // Esperando a entrega ser confirmada pelo servidor.
  waiting: number;
  failed: number;
  // Houve queda de rede ou erro do servidor: tentar de novo mais tarde.
  retry: boolean;
  interrupted: 'auth_error' | null;
}

interface AttachmentRecord extends LocalRecord {
  actor_id: string;
  endpoint_id: string;
  trip_id: string;
  outbox_item_id: string | null;
  delivery_id: string | null;
  kind: AttachmentKind;
  position: number;
  bytes: ArrayBuffer;
  sha256: string;
  size_bytes: number;
  content_type: string;
  captured_at: string;
  added_later: boolean;
  status: AttachmentStatus;
  failure_reason: string | null;
  created_at: string;
}

const REFUSALS: Record<AddRefusal, string> = {
  photo_limit: `Limite de ${MAX_PHOTOS} fotos por entrega.`,
  signature_limit: 'Esta entrega já tem assinatura.',
  no_space: 'Sem espaço para novas fotos. A entrega será registrada sem elas.',
  storage_failed: 'Não foi possível guardar neste aparelho. Libere espaço e tente de novo.',
};
const refuse = (reason: AddRefusal): AddResult => ({ ok: false, reason, message: REFUSALS[reason] });

// Motivo da recusa do servidor, em texto; código desconhecido cai numa frase segura.
const FAILURE_TEXT: Record<string, string> = {
  ACCESS_DENIED: 'Você não tem permissão para anexar a esta entrega.',
  DELIVERY_NOT_FOUND: 'O servidor não encontrou esta entrega.',
  ATTACHMENT_LIMIT: 'Esta entrega já tem o máximo de fotos ou a assinatura.',
  ATTACHMENT_WINDOW_CLOSED: 'O prazo para acrescentar anexos a esta entrega terminou.',
  ATTACHMENT_CONFLICT: 'Já existe outro anexo com este identificador.',
  VALIDATION_FAILED: 'O servidor recusou este arquivo.',
  PAYLOAD_TOO_LARGE: 'O arquivo é grande demais.',
};
const GENERIC_FAILURE = 'O servidor recusou este anexo.';
const failureText = (code: string | null): string | null => (code === null ? null : (Object.prototype.hasOwnProperty.call(FAILURE_TEXT, code) ? FAILURE_TEXT[code]! : GENERIC_FAILURE));

export class AttachmentService {
  private uploading = false;

  constructor(private readonly deps: { database: LocalDatabase; owner: RecordOwner & { organizationId: string }; uploader: AttachmentUploader; now?: () => Date }) {}

  private now(): Date { return (this.deps.now ?? (() => new Date()))(); }

  private async records(): Promise<AttachmentRecord[]> {
    const { actorId, endpointId } = this.deps.owner;
    return (await this.deps.database.listOwned('local_attachments', { actorId, endpointId })) as AttachmentRecord[];
  }

  private view(record: AttachmentRecord): AttachmentView {
    return {
      id: record.id, tripId: record.trip_id, kind: record.kind, position: record.position, status: record.status, sizeBytes: record.size_bytes, capturedAt: record.captured_at,
      outboxItemId: record.outbox_item_id, deliveryId: record.delivery_id, addedLater: record.added_later, failureText: failureText(record.failure_reason),
    };
  }

  async list(): Promise<AttachmentView[]> {
    return (await this.records()).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.position - b.position).map((record) => this.view(record));
  }

  async usage(): Promise<{ count: number; bytes: number; level: UsageLevel }> {
    const records = await this.records();
    const bytes = records.reduce((total, record) => total + record.size_bytes, 0);
    return { count: records.length, bytes, level: queueUsage(0, bytes).attachments };
  }

  async add(request: AddRequest): Promise<AddResult> {
    try {
      const records = await this.records();
      const target = request.target;
      const same = records.filter((record) => ('outboxItemId' in target ? record.outbox_item_id === target.outboxItemId : record.delivery_id === target.deliveryId && record.outbox_item_id === null));
      const existingPhotos = 'deliveryId' in target ? target.existingPhotos : 0;
      const hasSignature = 'deliveryId' in target ? target.hasSignature : false;
      let position = 0;
      if (request.kind === 'photo') {
        const pendingPhotos = same.filter((record) => record.kind === 'photo').length;
        const total = pendingPhotos + existingPhotos;
        const bytes = records.reduce((sum, record) => sum + record.size_bytes, 0);
        const decision = canAddPhoto(total, { attachmentBytes: bytes });
        if (!decision.allowed) return refuse(total >= MAX_PHOTOS ? 'photo_limit' : 'no_space');
        position = total + 1;
      } else if (hasSignature || same.some((record) => record.kind === 'signature')) {
        return refuse('signature_limit');
      }
      const record: AttachmentRecord = {
        id: request.file.id,
        organization_id: this.deps.owner.organizationId,
        actor_id: this.deps.owner.actorId,
        endpoint_id: this.deps.owner.endpointId,
        trip_id: request.tripId,
        outbox_item_id: 'outboxItemId' in target ? target.outboxItemId : null,
        delivery_id: 'deliveryId' in target ? target.deliveryId : null,
        kind: request.kind,
        position,
        bytes: request.file.bytes,
        sha256: request.file.sha256,
        size_bytes: request.file.sizeBytes,
        content_type: request.file.contentType,
        captured_at: request.file.capturedAt,
        added_later: 'deliveryId' in target ? target.addedLater ?? true : false,
        status: 'pending',
        failure_reason: null,
        created_at: this.now().toISOString(),
      };
      await this.deps.database.put('local_attachments', record);
      return { ok: true, position };
    } catch {
      // Falha de gravação (espaço, base fechada): o anexo **não** aparece como guardado.
      return refuse('storage_failed');
    }
  }

  // Só pendente ou recusado sai do aparelho por escolha; o que está sendo enviado ou já foi confirmado não.
  async remove(id: string): Promise<boolean> {
    const record = (await this.records()).find((entry) => entry.id === id);
    if (!record || (record.status !== 'pending' && record.status !== 'failed')) return false;
    await this.deps.database.delete('local_attachments', id);
    return true;
  }

  // A entrega foi confirmada pelo servidor: os anexos dela passam a ter para onde ir.
  async linkDelivery(outboxItemId: string, deliveryId: string): Promise<void> {
    for (const record of (await this.records()).filter((entry) => entry.outbox_item_id === outboxItemId && entry.delivery_id === null)) {
      await this.deps.database.put('local_attachments', { ...record, delivery_id: deliveryId });
    }
  }

  // A entrega foi descartada por decisão humana: os anexos que dependiam dela saem junto.
  async discardForItem(outboxItemId: string): Promise<void> {
    for (const record of (await this.records()).filter((entry) => entry.outbox_item_id === outboxItemId)) await this.deps.database.delete('local_attachments', record.id);
  }

  // O aplicativo foi fechado no meio de um envio: o que ficou "enviando" volta a pendente (o reenvio é idempotente).
  async markStaleUploadingPending(): Promise<void> {
    for (const record of (await this.records()).filter((entry) => entry.status === 'uploading')) await this.deps.database.put('local_attachments', { ...record, status: 'pending' });
  }

  async upload(): Promise<UploadSummary> {
    const summary: UploadSummary = { sent: 0, waiting: 0, failed: 0, retry: false, interrupted: null };
    if (this.uploading) return summary;
    this.uploading = true;
    try {
      const records = (await this.records()).filter((entry) => entry.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at) || a.position - b.position);
      summary.waiting = records.filter((entry) => entry.delivery_id === null).length;
      // Uma entrega parada por falha de rede não segura as outras, mas dentro dela a ordem vale.
      const blocked = new Set<string>();
      for (const record of records) {
        if (record.delivery_id === null || blocked.has(record.delivery_id)) continue;
        await this.deps.database.put('local_attachments', { ...record, status: 'uploading' });
        let response: { status: number; body: unknown };
        try {
          response = await this.deps.uploader.upload({
            organizationId: record.organization_id, deliveryId: record.delivery_id, attachmentId: record.id, kind: record.kind, position: record.position, capturedAt: record.captured_at,
            sha256: record.sha256, bytes: record.bytes, contentType: record.content_type, addedLater: record.added_later,
          });
        } catch {
          await this.deps.database.put('local_attachments', { ...record, status: 'pending' });
          summary.retry = true;
          blocked.add(record.delivery_id);
          continue;
        }
        const code = response.body !== null && typeof response.body === 'object' ? (response.body as { code?: unknown }).code : undefined;
        if (response.status >= 200 && response.status < 300 && (code === 'ATTACHED' || code === 'REPLAYED')) {
          await this.deps.database.delete('local_attachments', record.id);
          summary.sent += 1;
          continue;
        }
        if (response.status === 401) {
          await this.deps.database.put('local_attachments', { ...record, status: 'pending' });
          summary.interrupted = 'auth_error';
          return summary;
        }
        if (response.status >= 500 || response.status === 429 || response.status === 408) {
          await this.deps.database.put('local_attachments', { ...record, status: 'pending' });
          summary.retry = true;
          blocked.add(record.delivery_id);
          continue;
        }
        await this.deps.database.put('local_attachments', { ...record, status: 'failed', failure_reason: typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code) ? code : 'REFUSED' });
        summary.failed += 1;
      }
      return summary;
    } finally {
      this.uploading = false;
    }
  }
}

// Constante usada pela tela de limite da fila (RNF-004).
export const QUEUE_OPERATION_LIMIT = MAX_QUEUE_OPERATIONS;
