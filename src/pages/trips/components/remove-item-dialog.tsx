import React from 'react';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';

export interface RemoveItemDialogProps {
  serialNumber: string;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (justification: string) => void;
}

// Retirada de um cilindro no carregamento (exceção, RF-012): pede a justificativa, libera a reserva e devolve o foco ao acionador.
export function RemoveItemDialog({ serialNumber, busy, error, returnFocusTo, onCancel, onConfirm }: RemoveItemDialogProps): React.JSX.Element {
  return (
    <ReasonDialog
      title={`Retirar ${serialNumber} da viagem`}
      confirmLabel="Retirar da viagem"
      description="O cilindro sai desta viagem e fica livre para outra. É uma exceção: o motivo fica no histórico da viagem e do cilindro."
      busy={busy}
      error={error}
      returnFocusTo={returnFocusTo}
      onCancel={onCancel}
      onConfirm={(justification) => onConfirm(justification)}
    />
  );
}
