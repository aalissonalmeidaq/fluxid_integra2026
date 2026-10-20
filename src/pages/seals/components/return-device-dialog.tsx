import React from 'react';
import { ReasonDialog } from '@/pages/cylinders/components/reason-dialog';

// Devolver o lacre à plataforma (Spec 013, RF-013a; História 3, cenário 5). Sempre com justificativa de 5 a 500 caracteres; o lacre sai
// da lista do tenant e volta à fila do Master como "devolvido". O histórico dele continua neste tenant (RN-005).

export interface ReturnDeviceDialogProps {
  deviceCode: string;
  busy: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onCancel: () => void;
  onConfirm: (justification: string) => void;
}

export function ReturnDeviceDialog({ deviceCode, busy, error, returnFocusTo, onCancel, onConfirm }: ReturnDeviceDialogProps): React.JSX.Element {
  return (
    <ReasonDialog
      title={`Devolver à plataforma · ${deviceCode}`}
      confirmLabel="Devolver o lacre"
      description="O vínculo com o cilindro é encerrado, os comandos pendentes são cancelados e os alertas abertos fecham. O lacre esquece as redes Wi-Fi deste tenant e volta para o Master, que decide o destino dele. O histórico continua aqui."
      busy={busy}
      error={error}
      returnFocusTo={returnFocusTo}
      onCancel={onCancel}
      onConfirm={(justification) => onConfirm(justification)}
    />
  );
}
