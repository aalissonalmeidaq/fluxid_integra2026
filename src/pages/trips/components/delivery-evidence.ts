import type { CapturedPhoto } from '@/infrastructure/attachments/photo-capture';
import type { CapturedSignature } from '@/infrastructure/attachments/signature-canvas';

// O que a pessoa juntou à entrega (Spec 010): fotos e assinatura, ambas opcionais. Segue junto do registro da entrega, mas nunca faz parte dele: o registro vale sem isto.
export interface DeliveryEvidence {
  photos: CapturedPhoto[];
  signature: CapturedSignature | null;
}

// Liga os blocos de foto e de assinatura no diálogo (só no registro original; a correção não leva anexos).
export interface EvidenceOptions {
  // Bytes de anexos já guardados no aparelho (limite de 50 MB).
  usedBytes: number;
}

export const hasEvidence = (evidence: DeliveryEvidence): boolean => evidence.photos.length > 0 || evidence.signature !== null;

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Viagem em andamento, ou concluída há até 7 dias, e a entrega ainda com vaga.
export function canAddEvidence(input: { tripStatus: string; completedAt: string | null; photos: number; hasSignature: boolean; now: Date }): boolean {
  const open = input.tripStatus === 'in_progress'
    || (input.tripStatus === 'completed' && input.completedAt !== null && input.now.getTime() - Date.parse(input.completedAt) <= SEVEN_DAYS_MS);
  return open && (input.photos < 3 || !input.hasSignature);
}

