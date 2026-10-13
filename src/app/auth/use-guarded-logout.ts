import { useCallback, useState } from 'react';

// Sair com a fila: só a cópia da viagem sai do aparelho; os registros pendentes ficam (Spec 010, RF-007, RF-016).
export interface GuardedLogoutDeps {
  pendingCount: () => Promise<number>;
  // Envia a fila agora (com conexão); o resultado é conferido de novo pela contagem.
  sendAll: () => Promise<void>;
  // Remove só a cópia das viagens do aparelho; a fila e os anexos pendentes ficam.
  removeCopies: () => Promise<void>;
  logout: () => Promise<void>;
  online: boolean;
}

export interface LogoutWarning {
  pending: number;
  message?: string;
}

const NOT_ALL_SENT = 'Nem tudo foi enviado. Você pode tentar de novo, sair mesmo assim ou continuar no aplicativo.';

export function useGuardedLogout(deps: GuardedLogoutDeps): {
  warning: LogoutWarning | null; busy: boolean; request: () => Promise<void>; sendFirst: () => Promise<void>; leaveAnyway: () => Promise<void>; stay: () => void;
} {
  const [warning, setWarning] = useState<LogoutWarning | null>(null);
  const [busy, setBusy] = useState(false);
  const { pendingCount, sendAll, removeCopies, logout } = deps;

  const leave = useCallback(async (): Promise<void> => {
    await removeCopies().catch(() => undefined);
    setWarning(null);
    await logout();
  }, [removeCopies, logout]);

  const request = useCallback(async (): Promise<void> => {
    const pending = await pendingCount().catch(() => 0);
    if (pending > 0) { setWarning({ pending }); return; }
    await leave();
  }, [pendingCount, leave]);

  const sendFirst = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      await sendAll().catch(() => undefined);
      const pending = await pendingCount().catch(() => 1);
      if (pending > 0) { setWarning({ pending, message: NOT_ALL_SENT }); return; }
      await leave();
    } finally {
      setBusy(false);
    }
  }, [sendAll, pendingCount, leave]);

  const stay = useCallback((): void => setWarning(null), []);
  return { warning, busy, request, sendFirst, leaveAnyway: leave, stay };
}
