import { fail, ok, type Json, type Reply } from './mock-registry';
import type { TripMock, TripOperationContext } from './mock-trips';

// Fotos e assinatura da entrega no backend simulado (Spec 010, US3 e US4). Reproduz `trip-attachments` e `get_attachment_url` de
// specs/010-fila-offline-fotos-assinatura/contracts/operacoes-servidor.md §4 e §7: bytes reais conferidos pela assinatura de arquivo e pelo resumo, 3 fotos e
// 1 assinatura por entrega, janela de 7 dias, idempotência por `attachment_id` e a assinatura só com `trip.recipient`. O banco de verdade está no pgTAP.
export interface MockAttachment {
  id: string;
  organization_id: string;
  delivery_id: string;
  trip_id: string;
  kind: 'photo' | 'signature';
  position: number;
  sha256: string;
  bytes: Buffer;
  content_type: string;
  captured_at: string;
  added_later: boolean;
}

export function deliveryEvidence(mock: TripMock, deliveryId: string, canSeeSignature: boolean): Json {
  const own = mock.attachments.filter((attachment) => attachment.delivery_id === deliveryId);
  return {
    photo_count: own.filter((attachment) => attachment.kind === 'photo').length,
    has_signature: own.some((attachment) => attachment.kind === 'signature'),
    attachments: own.filter((attachment) => attachment.kind === 'photo' || canSeeSignature)
      .map((attachment) => ({ id: attachment.id, kind: attachment.kind, position: attachment.position, captured_at: attachment.captured_at, added_later: attachment.added_later })),
  };
}

// Corpo multipart (campos e arquivo), o bastante para o simulado.
export function parseMultipart(body: Buffer, contentType: string): { fields: Record<string, string>; file: Buffer | null } {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const delimiter = Buffer.from(`--${boundary?.[1] ?? boundary?.[2] ?? ''}`);
  const fields: Record<string, string> = {};
  let file: Buffer | null = null;
  let at = body.indexOf(delimiter);
  while (at !== -1) {
    const next = body.indexOf(delimiter, at + delimiter.length);
    if (next === -1) break;
    const part = body.subarray(at + delimiter.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, split).toString('utf8');
    const content = part.subarray(split + 4);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (name === 'file') file = Buffer.from(content);
    else if (name) fields[name] = content.toString('utf8');
    at = next;
  }
  return { fields, file };
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
export const ATTACHMENT_SIGN_PATH = '/storage/v1/object/sign/trip-evidence/';

export function uploadAttachment(mock: TripMock, body: Buffer, contentType: string, can: (organizationId: string, code: string) => boolean, sha256: (data: Buffer) => string): Reply {
  const { fields, file } = parseMultipart(body, contentType);
  const org = fields.organization_id ?? '';
  if (!can(org, 'trip.operate')) return fail('ACCESS_DENIED', 403);
  if (!file || file.length === 0) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'file', message: 'Envie o arquivo.' }] });
  const kind = fields.kind === 'signature' ? 'signature' : fields.kind === 'photo' ? 'photo' : null;
  if (!kind) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'kind', message: 'Tipo de anexo inválido.' }] });
  const jpeg = file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff;
  const png = file[0] === 0x89 && file[1] === 0x50 && file[2] === 0x4e && file[3] === 0x47;
  if ((kind === 'photo' && !jpeg) || (kind === 'signature' && !png)) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'file', message: 'O conteúdo do arquivo não é uma imagem aceita.' }] });
  if (file.length > (kind === 'photo' ? 1_572_864 : 204_800)) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'file', message: 'Tamanho do arquivo fora do limite.' }] });
  const sha = sha256(file);
  if (sha !== fields.sha256) return fail('VALIDATION_FAILED', 400, { fields: [{ field: 'sha256', message: 'O resumo não confere com o arquivo.' }] });
  mock.receivedRequestIds.push(`anexo:${fields.attachment_id}`);

  const delivery = mock.deliveries.find((candidate) => candidate.id === fields.delivery_id && candidate.organization_id === org);
  if (!delivery) return fail('DELIVERY_NOT_FOUND', 404);
  const stop = mock.stops.find((candidate) => candidate.id === delivery.stop_id)!;
  const trip = mock.trips.find((candidate) => candidate.id === stop.trip_id)!;
  const existing = mock.attachments.find((attachment) => attachment.id === fields.attachment_id);
  if (existing) {
    if (existing.sha256 !== sha || existing.delivery_id !== delivery.id) return fail('ATTACHMENT_CONFLICT', 409);
    return ok('REPLAYED', { replayed: true, id: existing.id, kind: existing.kind, position: existing.position });
  }
  const open = trip.status === 'in_progress' || (trip.status === 'completed' && trip.completed_at !== null && mock.now().getTime() - Date.parse(trip.completed_at) <= SEVEN_DAYS);
  if (!open) return fail('ATTACHMENT_WINDOW_CLOSED', 409);
  const position = Number(fields.position);
  const own = mock.attachments.filter((attachment) => attachment.delivery_id === delivery.id && attachment.kind === kind);
  if (own.some((attachment) => attachment.position === position) || (kind === 'photo' && own.length >= 3) || (kind === 'signature' && own.length >= 1)) return fail('ATTACHMENT_LIMIT', 409);
  mock.attachments.push({
    id: String(fields.attachment_id), organization_id: org, delivery_id: delivery.id, trip_id: trip.id, kind, position, sha256: sha, bytes: file,
    content_type: kind === 'photo' ? 'image/jpeg' : 'image/png', captured_at: String(fields.captured_at), added_later: fields.added_later === 'true',
  });
  mock.appendEvent(trip, 'evidence_attached', null, {
    photo_count: mock.attachments.filter((attachment) => attachment.delivery_id === delivery.id && attachment.kind === 'photo').length,
    has_signature: mock.attachments.some((attachment) => attachment.delivery_id === delivery.id && attachment.kind === 'signature'),
  });
  return ok('ATTACHED', { id: fields.attachment_id, kind, position });
}

function getAttachmentUrl({ org, body, can, mock }: TripOperationContext): Reply {
  const attachment = mock.attachments.find((candidate) => candidate.id === body.attachment_id && candidate.organization_id === org);
  if (!attachment || (attachment.kind === 'signature' && !can(org, 'trip.recipient'))) return fail('NOT_FOUND', 404);
  return ok('FOUND', { url: `http://127.0.0.1:54321${ATTACHMENT_SIGN_PATH}${attachment.id}?token=teste`, expires_at: new Date(mock.now().getTime() + 60_000).toISOString() });
}

export function registerAttachmentOperations(mock: TripMock): void {
  mock.register('get_attachment_url', { kind: 'query', permission: 'trip.read', run: getAttachmentUrl });
}
