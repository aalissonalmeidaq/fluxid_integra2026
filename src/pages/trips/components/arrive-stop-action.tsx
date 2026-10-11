import React from 'react';
import { Button } from '@/design-system';

export interface ArriveStopActionProps {
  position: number | null;
  siteName: string;
  online: boolean;
  busy: boolean;
  loading: boolean;
  onArrive: () => void;
}

// Registro da chegada à parada (RF-013): vale em qualquer ordem. A chegada fora da ordem planejada é registrada e destacada, nunca recusada.
export function ArriveStopAction({ position, siteName, online, busy, loading, onArrive }: ArriveStopActionProps): React.JSX.Element {
  return (
    <Button variant="secundario" disabled={!online || busy} loading={loading} loadingLabel="Registrando…"
      aria-label={`Registrar chegada à parada ${position ?? ''} (${siteName})`} onClick={onArrive}>
      Registrar chegada
    </Button>
  );
}
