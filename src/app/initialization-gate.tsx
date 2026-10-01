import React, { useState } from 'react';
import { useConnectivity } from './connectivity-context';
import { AppInitializationScreen } from '@/components/system/app-initialization-screen';

// Só a fase de conexão é conhecida aqui. As fases de push, pull e gates de sessão/tenant dependem de
// sessão autenticada e ficam no SyncGate, dentro do AuthProvider.
// O shell permanece disponível offline ou bloqueado: o indicador de conectividade informa o estado.
// O portão bloqueia apenas a conexão inicial; novas sondagens não desmontam o app nem tiram o foco.
export function InitializationGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { result, reconnect } = useConnectivity();
  const [released, setReleased] = useState(false);
  const resolving = result.state === 'idle' || result.state === 'probing';

  if (!released && !resolving) setReleased(true);

  if (!released && resolving) {
    return <AppInitializationScreen phase="connecting" onRetry={() => void reconnect()} />;
  }
  return <>{children}</>;
}
