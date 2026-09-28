import React from 'react';
import { ResolutionResult, EndpointKind } from '@/infrastructure/supabase/connection-state';

export interface ConnectivityStatusProps {
  result: ResolutionResult;
  onReconnect?: () => void;
}

const ENDPOINT_LABELS: Record<EndpointKind, string> = {
  local: 'Dispositivo local',
  lan: 'Rede local (LAN)',
  cloud: 'Nuvem (Cloud)',
};

export function ConnectivityStatus({
  result,
  onReconnect,
}: ConnectivityStatusProps): React.JSX.Element {
  const { state, selectedEndpoint } = result;

  const endpointLabel = selectedEndpoint ? ENDPOINT_LABELS[selectedEndpoint] : '';

  if (state === 'probing') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden="true" />
        <span>Verificando conectividade...</span>
      </div>
    );
  }

  if (state === 'connected') {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400" aria-hidden="true" />
        <span>Conectado: {endpointLabel}</span>
      </div>
    );
  }

  if (state === 'degraded') {
    return (
      <div
        role="status"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-300 border border-yellow-500/20"
      >
        <span className="w-2 h-2 rounded-full bg-yellow-400" aria-hidden="true" />
        <span>Conectado via contingência: {endpointLabel}</span>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div
        role="alert"
        className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20"
      >
        <span className="w-2 h-2 rounded-full bg-rose-400" aria-hidden="true" />
        <span>Conexão bloqueada por erro de configuração ou autorização</span>
        {onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className="ml-2 inline-flex min-h-11 items-center underline text-white hover:text-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-400 rounded px-1"
          >
            Tentar reconectar
          </button>
        )}
      </div>
    );
  }

  if (state === 'offline') {
    return (
      <div
        role="alert"
        className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-500/20 text-slate-300 border border-slate-700"
      >
        <span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden="true" />
        <span>Sem conexão (Offline)</span>
        {onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className="ml-2 inline-flex min-h-11 items-center underline text-white hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 rounded px-1"
          >
            Reconectar
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="status" className="text-xs text-slate-500">
      Inicializando...
    </div>
  );
}
