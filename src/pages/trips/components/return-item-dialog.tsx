import React from 'react';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';

export interface ReturnItemDialogProps {
  serialNumber: string;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (justification: string) => void;
}

// Retorno ao estoque (RF-023, exceção): o cilindro em trânsito ou não entregue volta à organização, em estoque, com a justificativa.
export function ReturnItemDialog({ serialNumber, busy, error, returnFocusTo, onCancel, onConfirm }: ReturnItemDialogProps): React.JSX.Element {
  return (
    <ReasonDialog
      title={`Devolver ${serialNumber} ao estoque`}
      confirmLabel="Devolver ao estoque"
      description="O cilindro volta à organização, em estoque, e a reserva da viagem termina. É uma exceção: o motivo fica no histórico da viagem e do cilindro."
      busy={busy}
      error={error}
      returnFocusTo={returnFocusTo}
      onCancel={onCancel}
      onConfirm={(justification) => onConfirm(justification)}
    />
  );
}
