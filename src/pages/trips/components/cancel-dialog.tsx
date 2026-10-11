import React from 'react';
import type { TripStatus } from '@/domain/trips/trip-vocabulary';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';

export interface CancelDialogProps {
  tripNumber: number;
  status: Extract<TripStatus, 'planned' | 'loading' | 'in_progress'>;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (justification: string) => void;
}

// Cancelamento da viagem (RF-022): sempre com justificativa. Antes de sair, as reservas são liberadas. Em andamento (exceção), o que já saiu
// continua em trânsito até um retorno ao estoque ou uma entrega tardia: nada some sozinho.
export function CancelDialog({ tripNumber, status, busy, error, returnFocusTo, onCancel, onConfirm }: CancelDialogProps): React.JSX.Element {
  const inProgress = status === 'in_progress';
  return (
    <ReasonDialog
      title={`Cancelar a viagem n.º ${tripNumber}`}
      confirmLabel="Cancelar viagem"
      description={inProgress
        ? 'A viagem já saiu. Os cilindros que estão em trânsito continuam em trânsito até você registrar o retorno ao estoque ou uma entrega tardia. O cancelamento é uma exceção e fica no histórico e na auditoria.'
        : 'Os cilindros reservados ficam livres para outras viagens. O motivo fica no histórico da viagem e dos cilindros.'}
      busy={busy}
      error={error}
      returnFocusTo={returnFocusTo}
      onCancel={onCancel}
      onConfirm={(justification) => onConfirm(justification)}
    />
  );
}
