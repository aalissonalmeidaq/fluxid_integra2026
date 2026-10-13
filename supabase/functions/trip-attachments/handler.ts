import { json, preflight, UUID_PATTERN } from '../_shared/http.ts';
import type { OperationsGateway } from '../_shared/operations.ts';

// Fotos e assinatura da entrega (Spec 010, RF-018 a RF-023; contracts/operacoes-servidor.md §7). O ator e a sessão vêm do TOKEN, o caminho é gerado pelo banco e o
// arquivo é validado pelos bytes reais (assinatura de arquivo, tamanho e resumo): o cliente nunca escreve no bucket. A gravação é em duas fases: o banco valida e devolve
// o caminho, o objeto vai ao bucket e só então o banco grava a linha, o evento e a auditoria. A resposta traz só `id`, `kind` e `position` (nunca caminho nem nome).
export interface AttachmentsGateway extends OperationsGateway {
  store(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export const PHOTO_MAX_BYTES = 1_572_864;
export const SIGNATURE_MAX_BYTES = 204_800;
export const OBJECT_MAX_BYTES = 2_097_152;
// Teto do que se descarta ao recusar um corpo grande (padrão do avatar): a autenticação já ocorreu e nada é armazenado.
const DISCARD_LIMIT_BYTES = 16 * 1024 * 1024;
// O corpo multipart acrescenta cabeçalhos e campos ao arquivo.
const BODY_OVERHEAD_BYTES = 64 * 1024;

const ACTION = 'trip.evidence_attach';
const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const swallow = () => undefined;
const isoInstant = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));

type FieldIssue = { field: string; message: string };
const invalid = (...fields: FieldIssue[]): Response => json({ code: 'VALIDATION_FAILED', fields }, 400);

const STATUS: Record<string, number> = {
  AUTH_REQUIRED: 401, ACCESS_DENIED: 403, DELIVERY_NOT_FOUND: 404, ATTACHMENT_LIMIT: 409, ATTACHMENT_WINDOW_CLOSED: 409, ATTACHMENT_CONFLICT: 409, VALIDATION_FAILED: 400,
};

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean => signature.every((byte, index) => bytes[index] === byte);

export function createTripAttachmentsHandler(gateway: AttachmentsGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);

    try {
      return await attach(gateway, request, identity);
    } catch {
      return json({ code: 'SERVICE_UNAVAILABLE' }, 503);
    }
  };
}

// Descarta o corpo recusado, com teto, e libera o fluxo sem esperar o cancelamento terminar.
async function discardBody(request: Request): Promise<void> {
  const reader = request.body?.getReader();
  if (!reader) return;
  let consumed = 0;
  try {
    while (consumed < DISCARD_LIMIT_BYTES) {
      const { done, value } = await reader.read();
      if (done) return;
      consumed += value.byteLength;
    }
  } catch { /* corpo já interrompido pelo cliente */ } finally {
    reader.cancel().catch(swallow);
  }
}

const text = (form: FormData, name: string): string | null => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : null;
};

async function attach(gateway: AttachmentsGateway, request: Request, identity: { userId: string; sessionId: string }): Promise<Response> {
  // Recusa pelo cabeçalho antes de ler o corpo; a validação abaixo repete a checagem com o tamanho real.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > OBJECT_MAX_BYTES + BODY_OVERHEAD_BYTES) {
    await discardBody(request);
    return json({ code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalid({ field: 'file', message: 'Corpo inválido.' });
  }

  const organizationId = text(form, 'organization_id');
  const deliveryId = text(form, 'delivery_id');
  const attachmentId = text(form, 'attachment_id');
  const kind = text(form, 'kind');
  const position = Number(text(form, 'position'));
  const capturedAt = text(form, 'captured_at');
  const sha256 = text(form, 'sha256')?.toLowerCase() ?? null;
  const addedLater = text(form, 'added_later') === 'true';
  const file = form.get('file');

  const issues: FieldIssue[] = [];
  if (!organizationId || !UUID_PATTERN.test(organizationId)) issues.push({ field: 'organization_id', message: 'Organização inválida.' });
  if (!deliveryId || !UUID_PATTERN.test(deliveryId)) issues.push({ field: 'delivery_id', message: 'Entrega inválida.' });
  if (!attachmentId || !UUID_PATTERN.test(attachmentId)) issues.push({ field: 'attachment_id', message: 'Identificador do anexo inválido.' });
  if (kind !== 'photo' && kind !== 'signature') issues.push({ field: 'kind', message: 'Tipo de anexo inválido.' });
  if (!Number.isInteger(position) || (kind === 'photo' && (position < 1 || position > 3)) || (kind === 'signature' && position !== 0)) issues.push({ field: 'position', message: 'Posição inválida.' });
  if (!capturedAt || !isoInstant(capturedAt)) issues.push({ field: 'captured_at', message: 'Hora da captura inválida.' });
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256)) issues.push({ field: 'sha256', message: 'Resumo do arquivo inválido.' });
  if (!(file instanceof Blob)) issues.push({ field: 'file', message: 'Envie o arquivo.' });
  if (issues.length > 0 || !(file instanceof Blob)) return invalid(...issues);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > OBJECT_MAX_BYTES) return json({ code: 'PAYLOAD_TOO_LARGE' }, 413);
  const limit = kind === 'photo' ? PHOTO_MAX_BYTES : SIGNATURE_MAX_BYTES;
  if (bytes.byteLength < 1 || bytes.byteLength > limit) return invalid({ field: 'file', message: 'Tamanho do arquivo fora do limite.' });
  // O tipo vale pelos bytes reais, não pelo que o cliente declarou.
  const contentType = kind === 'photo' ? 'image/jpeg' : 'image/png';
  const signatureOk = kind === 'photo' ? startsWith(bytes, [0xff, 0xd8, 0xff]) : startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
  if (!signatureOk) return invalid({ field: 'file', message: 'O conteúdo do arquivo não é uma imagem aceita.' });
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (digest !== sha256) return invalid({ field: 'sha256', message: 'O resumo não confere com o arquivo.' });

  const base = {
    p_actor: identity.userId, p_session: identity.sessionId, p_organization: organizationId, p_delivery: deliveryId, p_id: attachmentId, p_kind: kind, p_position: position,
    p_content_type: contentType, p_size: bytes.byteLength, p_sha256: sha256, p_captured_at: capturedAt, p_added_later: addedLater,
  };

  const checked = await gateway.rpc('attach_trip_evidence', { ...base, p_confirm: false });
  const checkedCode = String(checked.code);
  if (checkedCode === 'REPLAYED') return json({ code: 'REPLAYED', replayed: true, id: checked.id, kind: checked.kind, position: checked.position });
  if (checkedCode !== 'READY') return refused(gateway, identity.userId, checked);

  const path = String(checked.storage_path);
  await gateway.store(path, bytes, contentType);
  const stored = await gateway.rpc('attach_trip_evidence', { ...base, p_confirm: true });
  const storedCode = String(stored.code);
  if (storedCode === 'ATTACHED') return json({ code: 'ATTACHED', id: stored.id, kind: stored.kind, position: stored.position });
  if (storedCode === 'REPLAYED') return json({ code: 'REPLAYED', replayed: true, id: stored.id, kind: stored.kind, position: stored.position });
  // A linha não valeu (corrida, janela fechada): o objeto novo sai, para não sobrar arquivo sem registro.
  await gateway.remove(path).catch(swallow);
  return refused(gateway, identity.userId, stored);
}

async function refused(gateway: AttachmentsGateway, actorId: string, result: Record<string, unknown>): Promise<Response> {
  const code = String(result.code);
  const status = STATUS[code];
  if (status === undefined) return json({ code: 'SERVICE_UNAVAILABLE' }, 503);
  if (code === 'ACCESS_DENIED' || code === 'AUTH_REQUIRED') await gateway.audit({ actorId, action: ACTION, result: 'denied', reason: code }).catch(swallow);
  if (code === 'VALIDATION_FAILED') return json({ code, fields: Array.isArray(result.fields) ? result.fields : [] }, status);
  return json({ code }, status);
}

