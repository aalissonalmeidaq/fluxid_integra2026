import React from 'react';
import { StatusBadge, VisuallyHidden, type StatusBadgeVariant } from '@/design-system';
import type { ValidityStatus } from '@/domain/shared/validity-status';
import {
  ENTITY_STATUS_LABELS, VALIDITY_LABELS, VEHICLE_STATUS_LABELS, type EntityStatus, type VehicleStatus,
} from '@/domain/registry/registry-vocabulary';

const ENTITY_VARIANTS: Record<EntityStatus, StatusBadgeVariant> = { active: 'ativo', inactive: 'bloqueado' };
const VEHICLE_VARIANTS: Record<VehicleStatus, StatusBadgeVariant> = { available: 'ativo', maintenance: 'pendente', inactive: 'bloqueado' };
const VALIDITY_VARIANTS: Record<ValidityStatus, StatusBadgeVariant> = { em_dia: 'ativo', a_vencer: 'pendente', vencido: 'erro', sem_data: 'bloqueado' };

// Todas as situações dos cadastros aparecem com texto e ícone, nunca só cor (RF-044). O prefixo visível só para leitor de tela
// evita confundir "Ativo" (cadastro) com "Disponível" (veículo) e com "Em dia" (documento).

// Situação cadastral de cliente, unidade, geocerca e motorista.
export function EntityStatusBadge({ status }: { status: EntityStatus }): React.JSX.Element {
  return <StatusBadge variant={ENTITY_VARIANTS[status]}><VisuallyHidden>Situação cadastral: </VisuallyHidden>{ENTITY_STATUS_LABELS[status]}</StatusBadge>;
}

// Situação do veículo: disponível, em manutenção ou inativo (independente da situação do licenciamento).
export function VehicleStatusBadge({ status }: { status: VehicleStatus }): React.JSX.Element {
  return <StatusBadge variant={VEHICLE_VARIANTS[status]}><VisuallyHidden>Situação do veículo: </VisuallyHidden>{VEHICLE_STATUS_LABELS[status]}</StatusBadge>;
}

// Situação calculada do documento com validade (licenciamento do veículo e CNH).
export function ValidityBadge({ status, subject }: { status: ValidityStatus; subject: 'Licenciamento' | 'CNH' }): React.JSX.Element {
  return <StatusBadge variant={VALIDITY_VARIANTS[status]}><VisuallyHidden>{subject}: </VisuallyHidden>{VALIDITY_LABELS[status]}</StatusBadge>;
}

// Registro com os dados pessoais anonimizados (RF-058).
export function AnonymizedBadge(): React.JSX.Element {
  return <StatusBadge variant="bloqueado">Anonimizado</StatusBadge>;
}
