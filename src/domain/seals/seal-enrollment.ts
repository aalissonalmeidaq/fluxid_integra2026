// Pedido de aprovação do lacre (Spec 013, data-model.md, "Situações"; RF-010 a RF-016, RN-006). O banco tem as mesmas situações na
// restrição de public.seal_enrollments e decide de novo cada transição; aqui as regras servem para a tela avisar antes de enviar.
import { SEAL_LIMITS } from './seal-limits';
import type { Presentation } from './seal-vocabulary';

export const ENROLLMENT_STATUSES = ['pending', 'approved', 'refused', 'expired', 'returned'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

const STATUS: Record<EnrollmentStatus, Presentation> = {
  pending: { label: 'Aguardando vinculação a um tenant', icon: 'historico', tone: 'pendente' },
  approved: { label: 'Em operação', icon: 'verificado', tone: 'ativo' },
  refused: { label: 'Recusado', icon: 'bloqueio', tone: 'erro' },
  expired: { label: 'Expirado', icon: 'sem-sinal', tone: 'bloqueado' },
  returned: { label: 'Devolvido', icon: 'armazem', tone: 'bloqueado' },
};

export function enrollmentStatus(v: EnrollmentStatus): Presentation {
  if (!Object.prototype.hasOwnProperty.call(STATUS, v)) throw new Error(`situação de pedido desconhecida: ${String(v)}`);
  return STATUS[v];
}

// Conflito não é situação: é a marca de outro aparelho chamando com o mesmo código e outra chave (RF-010).
export const CONFLICT_PRESENTATION: Presentation = { label: 'Outro aparelho com este código', icon: 'alerta', tone: 'erro' };

export const ENROLLMENT_TRANSITIONS: Record<EnrollmentStatus, readonly EnrollmentStatus[]> = {
  pending: ['approved', 'refused', 'expired'],
  approved: ['pending', 'returned'],
  refused: ['approved'],
  expired: ['pending'],
  returned: ['approved'],
};

export const canTransition = (from: EnrollmentStatus, to: EnrollmentStatus): boolean => ENROLLMENT_TRANSITIONS[from].includes(to);

// Sinal em texto, nunca só por ícone (contracts/portal-do-lacre.md): forte a partir de -60 dBm, médio até -75, fraco abaixo.
export type SignalText = 'forte' | 'médio' | 'fraco';
export function signalText(dbm: number | null | undefined): SignalText | null {
  if (dbm === null || dbm === undefined) return null;
  if (dbm >= -60) return 'forte';
  if (dbm >= -75) return 'médio';
  return 'fraco';
}

// "Pronto para vincular" (RF-015): ativo no tenant e sem cilindro. A marca tem ícone e texto, como os selos da Spec 012.
export const READY_TO_BIND_PRESENTATION: Presentation = { label: 'Pronto para vincular', icon: 'lacre', tone: 'conectado' };
export const isReadyToBind = (seal: { status: string; cylinder: unknown }): boolean => seal.status === 'active' && !seal.cylinder;

// Justificativa de 5 a 500 caracteres depois de juntar os espaços, o mesmo critério de private.seal_text_ok no banco.
export type JustificationResult = { ok: true; value: string } | { ok: false; error: string };
export function validateJustification(text: string): JustificationResult {
  const value = text.replace(/\s+/g, ' ').trim();
  if (value.length < SEAL_LIMITS.justificationMin || value.length > SEAL_LIMITS.justificationMax) {
    return { ok: false, error: `Escreva uma justificativa de ${SEAL_LIMITS.justificationMin} a ${SEAL_LIMITS.justificationMax} caracteres.` };
  }
  return { ok: true, value };
}

export interface ApprovalCandidate {
  status: EnrollmentStatus;
  conflict: boolean;
  lastOrganizationId: string | null;
  lastOrganizationName: string | null;
}

// O que impede aprovar o pedido para o tenant escolhido, em texto para a tela (nulo quando nada impede). A ordem é a do banco.
export function approvalBlock(candidate: ApprovalCandidate, organizationId: string): string | null {
  if (candidate.status === 'approved') return 'Este lacre já está em operação. Retire-o antes de destinar de novo.';
  if (candidate.status === 'expired') return 'O pedido expirou. Ele volta a aguardar quando o lacre chamar de novo.';
  if (candidate.conflict) return `${CONFLICT_PRESENTATION.label}. Resolva o conflito antes de aprovar.`;
  if (candidate.lastOrganizationId && candidate.lastOrganizationId !== organizationId) {
    return `Este lacre ainda pode ter redes do tenant ${candidate.lastOrganizationName ?? 'anterior'}. Use "Esquecer todas as redes" e configure a rede no novo local.`;
  }
  return null;
}

// Rede de configuração do lacre (RF-001): FluxID-Lacre- mais os 4 últimos caracteres do código.
export const portalNetworkName = (deviceCode: string): string => `FluxID-Lacre-${deviceCode.slice(-4)}`;
