import React from 'react';
import { StatusBadge, VisuallyHidden, type StatusBadgeVariant } from '@/design-system';
import {
  HYDROSTATIC_LABELS, STATUS_LABELS, STOCK_LABELS, type CylinderStatus, type HydrostaticStatus, type StockStatus,
} from '@/domain/cylinders/cylinder-types';

const STATUS_VARIANTS: Record<CylinderStatus, StatusBadgeVariant> = { active: 'ativo', inactive: 'bloqueado' };
const STOCK_VARIANTS: Record<StockStatus, StatusBadgeVariant> = { in_stock: 'conectado', out_of_stock: 'bloqueado' };
const HYDRO_VARIANTS: Record<HydrostaticStatus, StatusBadgeVariant> = {
  em_dia: 'ativo', a_vencer: 'pendente', vencido: 'erro', reprovado: 'erro', sem_teste: 'bloqueado',
};

export interface StatusBadgesProps {
  status: CylinderStatus;
  stockStatus: StockStatus;
  hydroStatus: HydrostaticStatus;
}

// As três situações são independentes (RF-018, Constituição IV) e aparecem separadas, sempre com texto e ícone, nunca só cor.
// O prefixo visível só para leitor de tela evita confundir "Ativo" (cadastro) com "Em estoque".
export function StatusBadges({ status, stockStatus, hydroStatus }: StatusBadgesProps): React.JSX.Element {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge variant={STATUS_VARIANTS[status]}><VisuallyHidden>Situação cadastral: </VisuallyHidden>{STATUS_LABELS[status]}</StatusBadge>
      <StatusBadge variant={STOCK_VARIANTS[stockStatus]}><VisuallyHidden>Situação de estoque: </VisuallyHidden>{STOCK_LABELS[stockStatus]}</StatusBadge>
      <StatusBadge variant={HYDRO_VARIANTS[hydroStatus]}><VisuallyHidden>Situação do teste: </VisuallyHidden>{HYDROSTATIC_LABELS[hydroStatus]}</StatusBadge>
    </span>
  );
}

// Cilindro sem nenhum identificador ativo (história 5, cenário 4).
export function IdentifierWarning({ activeCount }: { activeCount: number }): React.JSX.Element | null {
  if (activeCount > 0) return null;
  return <StatusBadge variant="pendente">Sem identificador</StatusBadge>;
}
