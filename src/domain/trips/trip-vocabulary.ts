// Vocabulário das viagens da Fase 4 (data-model.md). O banco tem as mesmas listas nas restrições de
// supabase/migrations/*trips_schema.sql; trip-vocabulary.test.ts reprova divergência.

export const TRIP_STATUSES = ['planned', 'loading', 'in_progress', 'completed', 'cancelled'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  planned: 'Planejada', loading: 'Carregando', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada',
};

// `removed` é a parada tirada do planejamento numa edição: nada é excluído (RF-033) e ela perde a posição.
export const STOP_STATUSES = ['pending', 'on_site', 'delivered', 'with_divergence', 'removed'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];
export const STOP_STATUS_LABELS: Record<StopStatus, string> = {
  pending: 'Pendente', on_site: 'No local', delivered: 'Entregue', with_divergence: 'Com divergência', removed: 'Removida',
};

export const ITEM_STATUSES = ['planned', 'checked', 'in_transit', 'delivered', 'not_delivered', 'removed', 'released', 'returned'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  planned: 'Planejado', checked: 'Conferido', in_transit: 'Em trânsito', delivered: 'Entregue', not_delivered: 'Não entregue',
  removed: 'Retirado', released: 'Liberado', returned: 'Devolvido ao estoque',
};

// O bloqueio é lógico (Clarifications): registra a reserva, não o acionamento da trava. A Fase 6 acrescenta a confirmação do dispositivo.
export const LOCK_STATUSES = ['none', 'locked', 'unlocked'] as const;
export type LockStatus = (typeof LOCK_STATUSES)[number];
export const LOCK_STATUS_LABELS: Record<LockStatus, string> = { none: 'Sem bloqueio', locked: 'Bloqueado (lógico)', unlocked: 'Desbloqueado' };

export const CUSTODY_STATUSES = ['in_organization', 'in_transit', 'at_customer'] as const;
export type CustodyStatus = (typeof CUSTODY_STATUSES)[number];
export const CUSTODY_STATUS_LABELS: Record<CustodyStatus, string> = { in_organization: 'Na organização', in_transit: 'Em trânsito', at_customer: 'No cliente' };

export const TRIP_EVENT_TYPES = [
  'trip_created', 'trip_updated', 'loading_started', 'loading_reverted', 'item_checked', 'item_unchecked', 'item_removed',
  'trip_started', 'stop_arrived', 'delivery_registered', 'delivery_corrected', 'unlock_registered', 'item_returned',
  'trip_completed', 'trip_cancelled',
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];
export const TRIP_EVENT_LABELS: Record<TripEventType, string> = {
  trip_created: 'Viagem planejada', trip_updated: 'Viagem editada', loading_started: 'Carregamento iniciado', loading_reverted: 'Carregamento desfeito',
  item_checked: 'Cilindro conferido', item_unchecked: 'Conferência desfeita', item_removed: 'Cilindro retirado', trip_started: 'Viagem iniciada',
  stop_arrived: 'Chegada à parada', delivery_registered: 'Entrega registrada', delivery_corrected: 'Entrega corrigida', unlock_registered: 'Desbloqueio registrado',
  item_returned: 'Cilindro devolvido ao estoque', trip_completed: 'Viagem concluída', trip_cancelled: 'Viagem cancelada',
};

// Tipos de evento que a viagem acrescenta ao histórico do cilindro (Spec 006).
export const CYLINDER_TRIP_EVENT_TYPES = ['trip_reserved', 'trip_released', 'trip_departed', 'trip_delivered', 'trip_returned'] as const;
export type CylinderTripEventType = (typeof CYLINDER_TRIP_EVENT_TYPES)[number];
export const CYLINDER_TRIP_EVENT_LABELS: Record<CylinderTripEventType, string> = {
  trip_reserved: 'Reservado para viagem', trip_released: 'Liberado da viagem', trip_departed: 'Saiu em viagem',
  trip_delivered: 'Entregue ao cliente', trip_returned: 'Devolvido ao estoque pela viagem',
};

export const CHECK_SOURCES = ['manual'] as const;
export type CheckSource = (typeof CHECK_SOURCES)[number];

// Situações em que o item reserva o cilindro (índice único parcial `is_open`).
export const OPEN_ITEM_STATUSES: readonly ItemStatus[] = ['planned', 'checked', 'in_transit', 'not_delivered'];
export const isOpenItem = (status: ItemStatus): boolean => OPEN_ITEM_STATUSES.includes(status);

// Viagens que ocupam veículo e motorista (índices únicos parciais).
export const BUSY_TRIP_STATUSES: readonly TripStatus[] = ['loading', 'in_progress'];

// Viagem encerrada: não aceita edição nem operação.
export const FINAL_TRIP_STATUSES: readonly TripStatus[] = ['completed', 'cancelled'];
export const isFinalTrip = (status: TripStatus): boolean => FINAL_TRIP_STATUSES.includes(status);

// Motivos de recusa de um cilindro no planejamento e no início (contracts/operacoes-servidor.md).
export const CYLINDER_REFUSAL_REASONS = ['inactive', 'out_of_stock', 'hydro_expired', 'hydro_rejected', 'hydro_missing'] as const;
export type CylinderRefusalReason = (typeof CYLINDER_REFUSAL_REASONS)[number];
export const CYLINDER_REFUSAL_LABELS: Record<CylinderRefusalReason, string> = {
  inactive: 'cilindro inativo', out_of_stock: 'cilindro fora do estoque', hydro_expired: 'teste hidrostático vencido',
  hydro_rejected: 'teste hidrostático reprovado', hydro_missing: 'sem teste hidrostático registrado',
};

export const RECIPIENT_RESTRICTED = '(restrito)';
