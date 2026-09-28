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
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300"
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
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-300"
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
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-900 border border-yellow-300"
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
        className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-100 text-rose-900 border border-rose-300"
      >
        <span className="w-2 h-2 rounded-full bg-rose-400" aria-hidden="true" />
        <span>Conexão bloqueada por erro de configuração ou autorização</span>
        {onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className="ml-2 inline-flex min-h-11 items-center underline text-rose-900 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-700 rounded px-1"
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
        className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-800 border border-slate-300"
      >
        <span className="w-2 h-2 rounded-full bg-slate-400" aria-hidden="true" />
        <span>Sem conexão (Offline)</span>
        {onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className="ml-2 inline-flex min-h-11 items-center underline text-slate-900 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-700 rounded px-1"
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
