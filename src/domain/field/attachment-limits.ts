// Limites de foto, assinatura e fila no aparelho (Spec 010, RF-018 a RF-020, RF-026, RNF-004; data-model.md §4). Puras: o navegador entra por
// `infrastructure/attachments`. O servidor repete cada limite (supabase/functions/trip-attachments).
export const MAX_PHOTOS = 3;
export const MAX_SIGNATURES = 1;
export const PHOTO_MAX_LONG_EDGE_PX = 1600;
export const PHOTO_MAX_BYTES = 1_572_864; // 1,5 MB
export const SIGNATURE_MAX_BYTES = 204_800; // 200 KB
export const PHOTO_CONTENT_TYPE = 'image/jpeg';
export const SIGNATURE_CONTENT_TYPE = 'image/png';
// A foto é recodificada em JPEG reduzindo a qualidade em passos até caber no limite de bytes.
export const PHOTO_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35] as const;

export const MAX_QUEUE_OPERATIONS = 200;
export const MAX_QUEUE_ATTACHMENT_BYTES = 52_428_800; // 50 MB
// A partir de 80% do limite a tela avisa em texto.
export const ATTACHMENT_WARNING_RATIO = 0.8;

export type PhotoDecision = { allowed: true } | { allowed: false; reason: string };

// Até 3 fotos por entrega; sem espaço no aparelho, novas fotos deixam de ser aceitas e a entrega segue sem elas (RF-026).
export function canAddPhoto(currentCount: number, usage: { attachmentBytes?: number } = {}): PhotoDecision {
  if (currentCount >= MAX_PHOTOS) return { allowed: false, reason: `Limite de ${MAX_PHOTOS} fotos por entrega.` };
  if ((usage.attachmentBytes ?? 0) >= MAX_QUEUE_ATTACHMENT_BYTES) return { allowed: false, reason: 'Sem espaço para novas fotos. A entrega será registrada sem elas.' };
  return { allowed: true };
}

// Reduz pelo lado maior mantendo a proporção; nunca amplia e nunca devolve lado menor que 1.
export function fitWithin(width: number, height: number, maxLongEdge: number = PHOTO_MAX_LONG_EDGE_PX): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Dimensões da imagem inválidas.');
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxLongEdge / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type UsageLevel = 'ok' | 'warn' | 'full';
export interface QueueUsage {
  operations: UsageLevel;
  attachments: UsageLevel;
  acceptNewPhotos: boolean;
  // O registro principal tem prioridade sobre os anexos: nunca é recusado por limite (RF-026); a tela só alerta.
  acceptNewOperations: true;
}

const level = (used: number, max: number): UsageLevel => (used >= max ? 'full' : used >= max * ATTACHMENT_WARNING_RATIO ? 'warn' : 'ok');

export function queueUsage(operations: number, attachmentBytes: number): QueueUsage {
  const attachments = level(attachmentBytes, MAX_QUEUE_ATTACHMENT_BYTES);
  return { operations: level(operations, MAX_QUEUE_OPERATIONS), attachments, acceptNewPhotos: attachments !== 'full', acceptNewOperations: true };
}

// Assinatura sem traço de verdade (um toque sem querer) não vale: menos de 0,2% da área riscada ou menos de 50 pixels.
const BLANK_MIN_PIXELS = 50;
const BLANK_MIN_RATIO = 0.002;
export function isSignatureBlank(inkedPixels: number, totalPixels: number): boolean {
  if (totalPixels <= 0) return true;
  return inkedPixels < BLANK_MIN_PIXELS || inkedPixels / totalPixels < BLANK_MIN_RATIO;
}
