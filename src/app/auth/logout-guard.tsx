import React from 'react';
import { Alert, Button, Dialog } from '@/design-system';

// Sair da conta com registros ainda não enviados (Spec 010, RF-007, RF-016, CA-006). A fila e os anexos pendentes **permanecem** no aparelho, presos à conta, à
// organização e ao destino de origem: só a cópia da viagem é removida. Nada se perde por sair, e a fila de uma conta nunca aparece para outra.
export interface LogoutGuardProps {
  pending: number;
  online: boolean;
  busy: boolean;
  message: string | null;
  returnFocusTo: HTMLElement | null;
  onSend: () => void;
  onLeave: () => void;
  onStay: () => void;
}

export function LogoutGuard({ pending, online, busy, message, returnFocusTo, onSend, onLeave, onStay }: LogoutGuardProps): React.JSX.Element {
  const many = pending !== 1;
  return (
    <Dialog
      title="Há registros que ainda não foram enviados"
      onClose={onStay}
      returnFocusTo={returnFocusTo}
      footer={(
        <>
          <Button variant="secundario" onClick={onStay}>Continuar no aplicativo</Button>
          <Button variant="secundario" disabled={busy} onClick={onLeave}>Sair mesmo assim</Button>
          <Button disabled={!online || busy} loading={busy} loadingLabel="Enviando…" onClick={onSend}>Enviar antes de sair</Button>
        </>
      )}
    >
      <p className="text-corpo">{`Há ${pending} ${many ? 'operações que ainda não foram enviadas' : 'operação que ainda não foi enviada'}. Se você sair agora, ${many ? 'elas continuam guardadas' : 'ela continua guardada'} neste aparelho e ${many ? 'serão enviadas' : 'será enviada'} na próxima vez que você entrar com esta conta e houver conexão.`}</p>
      {!online && <p className="text-corpo font-semibold text-alerta-texto">Sem conexão: não dá para enviar agora.</p>}
      {message && <Alert variant="informacao">{message}</Alert>}
    </Dialog>
  );
}
