import React from 'react';
import { ConnectivityStatus } from '@/components/system/ConnectivityStatus';
import { SyncStatus } from '@/design-system/components/sync-status';
import { useConnectivity } from '../connectivity-context';
import { useOnlineStatus } from '../use-online-status';
import { presentedConnectivity } from './presented-connectivity';

// Aviso de que o dispositivo perdeu a rede; anunciado sem mover o foco.
export function OfflineNotice(): React.JSX.Element | null {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;
  return (
    <div className="flex justify-center bg-alerta-fundo px-4 py-2">
      <SyncStatus state="offline" detail="Dispositivo sem conexão de rede. Modo offline em operação." />
    </div>
  );
}

export interface ConnectionBarProps {
  // Na barra superior só o estado do Supabase, de forma discreta; o aviso de offline fica em OfflineNotice, abaixo da barra.
  inline?: boolean;
}

// Barra de conexão: avisa quando o dispositivo perde a rede e mostra o estado do Supabase com o botão de reconectar,
// também para quem ainda não entrou (RF-013). Com a sessão autenticada o estado vai para a barra superior (`inline`).
export function ConnectionBar({ inline = false }: ConnectionBarProps): React.JSX.Element {
  const { result, reconnect } = useConnectivity();
  // Uma só fonte de verdade: sem rede no aparelho, o estado mostrado é "offline" e o aviso de offline é quem anuncia.
  const isOnline = useOnlineStatus();
  const shown = presentedConnectivity(result, isOnline);
  if (inline) {
    return (
      <div data-testid="connection-bar" className="flex items-center">
        <ConnectivityStatus compact announce={isOnline} result={shown} onReconnect={() => void reconnect()} />
      </div>
    );
  }
  return (
    <div data-testid="connection-bar" className="flex flex-col">
      <OfflineNotice />
      <div className="flex justify-end px-4 py-2 tablet:px-6">
        <ConnectivityStatus announce={isOnline} result={shown} onReconnect={() => void reconnect()} />
      </div>
    </div>
  );
}
