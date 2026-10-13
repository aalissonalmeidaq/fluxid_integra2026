// Textos e estados da fila e da sincronização (Spec 010, RF-004, RF-026, RF-030; contracts/telas-e-fluxos.md §1 a §3). Puros.
export type ItemStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed' | 'discarded';
export type AttachmentStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

// Item sem confirmação do servidor há mais de 24 horas aparece destacado em texto (RF-026); nada é apagado por isso.
export const OLD_PENDING_AFTER_MS = 24 * 60 * 60 * 1000;

export function hasOldPending(queuedAt: string, now: Date): boolean {
  return now.getTime() - new Date(queuedAt).getTime() > OLD_PENDING_AFTER_MS;
}

export interface IndicatorInput {
  // Itens aguardando envio (não inclui os que estão sendo enviados agora).
  pending: number;
  syncing: number;
  // Todos os itens abertos da fila (pendentes, enviando e em conflito).
  total: number;
  conflicts: number;
  // Pendentes há mais de 24 horas.
  oldPending: number;
  online: boolean;
}

const plural = (n: number, singular: string, many: string) => `${n} ${n === 1 ? singular : many}`;

// Texto do indicador da barra superior; nulo quando não há nada a mostrar. Conflito vale mais que pendente, que vale mais que o resto.
export function indicatorText(input: IndicatorInput): string | null {
  if (input.conflicts > 0) return plural(input.conflicts, 'conflito', 'conflitos');
  const waiting = input.pending + input.syncing;
  if (waiting === 0) return null;
  if (!input.online) return `Sem conexão, ${plural(waiting, 'pendente', 'pendentes')}`;
  if (input.syncing > 0) return `Enviando ${input.total - input.pending} de ${input.total}…`;
  if (input.oldPending > 0) return `${plural(waiting, 'pendente', 'pendentes')}, ${input.oldPending} há mais de 24 h`;
  return plural(waiting, 'pendente', 'pendentes');
}

const ITEM_LABELS: Record<ItemStatus, string> = {
  pending: 'Pendente', syncing: 'Enviando', synced: 'Enviado', conflict: 'Conflito', failed: 'Falhou', discarded: 'Descartado',
};
export const itemStatusLabel = (status: ItemStatus): string => ITEM_LABELS[status];

const ATTACHMENT_LABELS: Record<AttachmentStatus, string> = { pending: 'Pendente', uploading: 'Enviando', uploaded: 'Enviado', failed: 'Recusado' };
export const attachmentStatusLabel = (status: AttachmentStatus): string => ATTACHMENT_LABELS[status];

export interface OperationContext {
  serial?: string;
  stopPosition?: number;
}

// Descrição curta da operação da fila, sem dado sensível (nada de coordenada, recebedor ou valor lido).
export function operationLabel(operation: string, context: OperationContext): string {
  switch (operation) {
    case 'trip.check_item': return `Conferência do cilindro ${context.serial ?? ''}`.trim();
    case 'trip.uncheck_item': return `Desfazer a conferência do cilindro ${context.serial ?? ''}`.trim();
    case 'trip.arrive_stop': return `Chegada à parada ${context.stopPosition ?? ''}`.trim();
    case 'trip.deliver': return `Entrega da parada ${context.stopPosition ?? ''}`.trim();
    default: return 'Operação de campo';
  }
}

const GENERIC_REASON = 'O servidor recusou este registro. Veja o motivo.';
const CONFLICT_REASONS: Record<string, string> = {
  TRIP_CLOSED: 'A viagem foi encerrada depois que você registrou isto.',
  INVALID_TRANSITION: 'A situação mudou e o servidor não aceita mais esta operação.',
  STOP_CLOSED: 'A parada já foi encerrada.',
  NOT_FOUND: 'Este item saiu da viagem ou da parada.',
  STALE_OFFLINE_OPERATION: 'Registro com mais de 7 dias de atraso. Peça a uma pessoa autorizada para decidir.',
  VERSION_CONFLICT: 'A viagem foi alterada por outra pessoa.',
  VALIDATION_FAILED: GENERIC_REASON,
  MISSING_DEPENDENCY: 'Depende de um registro que foi descartado.',
};

// Texto do motivo do conflito a partir do código do servidor; código desconhecido cai numa frase segura (nunca mostra o código cru).
export function conflictReasonText(code: string): string {
  return Object.prototype.hasOwnProperty.call(CONFLICT_REASONS, code) ? CONFLICT_REASONS[code]! : GENERIC_REASON;
}
