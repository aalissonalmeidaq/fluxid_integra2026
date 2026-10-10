import React from 'react';
import { StatusBadge, VisuallyHidden, type StatusBadgeVariant } from '@/design-system';
import {
  CUSTODY_STATUS_LABELS, ITEM_STATUS_LABELS, LOCK_STATUS_LABELS, STOP_STATUS_LABELS, TRIP_STATUS_LABELS,
  type CustodyStatus, type ItemStatus, type LockStatus, type StopStatus, type TripStatus,
} from '@/domain/trips/trip-vocabulary';

// Todas as situações da viagem aparecem com texto e ícone, nunca só cor (RF-008, CA-008). O prefixo só para leitor de tela diz de qual
// estado se trata, porque viagem, parada, item, bloqueio e custódia são estados independentes.

const TRIP: Record<TripStatus, StatusBadgeVariant> = { planned: 'pendente', loading: 'conectado', in_progress: 'conectado', completed: 'ativo', cancelled: 'bloqueado' };
const STOP: Record<StopStatus, StatusBadgeVariant> = { pending: 'pendente', on_site: 'conectado', delivered: 'ativo', with_divergence: 'erro', removed: 'bloqueado' };
const ITEM: Record<ItemStatus, StatusBadgeVariant> = {
  planned: 'pendente', checked: 'conectado', in_transit: 'conectado', delivered: 'ativo', not_delivered: 'erro', removed: 'bloqueado', released: 'bloqueado', returned: 'bloqueado',
};
const LOCK: Record<LockStatus, StatusBadgeVariant> = { none: 'bloqueado', locked: 'bloqueado', unlocked: 'ativo' };
const CUSTODY: Record<CustodyStatus, StatusBadgeVariant> = { in_organization: 'bloqueado', in_transit: 'conectado', at_customer: 'ativo' };

export function TripStatusBadge({ status }: { status: TripStatus }): React.JSX.Element {
  return <StatusBadge variant={TRIP[status]}><VisuallyHidden>Situação da viagem: </VisuallyHidden>{TRIP_STATUS_LABELS[status]}</StatusBadge>;
}

export function StopStatusBadge({ status }: { status: StopStatus }): React.JSX.Element {
  return <StatusBadge variant={STOP[status]}><VisuallyHidden>Situação da parada: </VisuallyHidden>{STOP_STATUS_LABELS[status]}</StatusBadge>;
}

export function ItemStatusBadge({ status }: { status: ItemStatus }): React.JSX.Element {
  return <StatusBadge variant={ITEM[status]}><VisuallyHidden>Situação do cilindro na viagem: </VisuallyHidden>{ITEM_STATUS_LABELS[status]}</StatusBadge>;
}

// "Bloqueado (lógico)": registra a reserva, não o acionamento da trava. A confirmação do dispositivo é da Fase 6.
export function LockBadge({ status }: { status: LockStatus }): React.JSX.Element | null {
  if (status === 'none') return null;
  return <StatusBadge variant={LOCK[status]}><VisuallyHidden>Bloqueio: </VisuallyHidden>{LOCK_STATUS_LABELS[status]}</StatusBadge>;
}

export function CustodyBadge({ status }: { status: CustodyStatus }): React.JSX.Element {
  return <StatusBadge variant={CUSTODY[status]}><VisuallyHidden>Custódia: </VisuallyHidden>{CUSTODY_STATUS_LABELS[status]}</StatusBadge>;
}

// Viagem planejada ou carregando com a data prevista no passado (RF-001a).
export function OverdueBadge(): React.JSX.Element {
  return <StatusBadge variant="erro">Atrasada</StatusBadge>;
}
