import React from 'react';
import { ConnectivityStatus } from '@/components/system/ConnectivityStatus';
import { SyncStatus } from '@/design-system/components/sync-status';
import { useConnectivity } from '../connectivity-context';
import { useOnlineStatus } from '../use-online-status';

// Barra de conexão: avisa quando o dispositivo perde a rede e mostra o estado do Supabase com o botão de reconectar,
// também para quem ainda não entrou (RF-013). As mudanças são anunciadas sem mover o foco.
export function ConnectionBar(): React.JSX.Element {
  const { result, reconnect } = useConnectivity();
  const isOnline = useOnlineStatus();
  return (
    <div data-testid="connection-bar" className="flex flex-col">
      {!isOnline && (
        <div className="flex justify-center bg-alerta-fundo px-4 py-2">
          <SyncStatus state="offline" detail="Dispositivo sem conexão de rede. Modo offline em operação." />
        </div>
      )}
      <div className="flex justify-end px-4 py-2 tablet:px-6">
        <ConnectivityStatus result={result} onReconnect={() => void reconnect()} />
      </div>
    </div>
  );
}
