import React, { useEffect, useRef, useState } from 'react';
import type { EndpointKind } from '@/infrastructure/supabase/connection-state';

export type InitializationPhase =
  | 'inspecting'
  | 'connecting'
  | 'pushing'
  | 'pulling'
  | 'preparing'
  | 'completed'
  | 'failed'
  | 'conflict'
  | 'session_expired'
  | 'access_denied';

export interface AppInitializationScreenProps {
  phase: InitializationPhase;
  endpoint?: EndpointKind;
  onRetry: () => void;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const PROGRESS_MESSAGES: Record<'inspecting' | 'connecting' | 'pushing' | 'pulling' | 'preparing' | 'completed', string> = {
  inspecting: 'Verificando alterações locais',
  connecting: 'Conectando à nuvem',
  pushing: 'Sincronizando alterações',
  pulling: 'Atualizando informações',
  preparing: 'Preparando aplicação',
  completed: 'Sincronização concluída',
};

const BLOCKING_MESSAGES: Record<'failed' | 'conflict' | 'session_expired' | 'access_denied', { title: string; guidance: string }> = {
  failed: {
    title: 'Falha de conexão',
    guidance: 'Nenhum servidor respondeu. Verifique a rede e tente novamente.',
  },
  conflict: {
    title: 'Conflito encontrado',
    guidance: 'Uma alteração diverge da versão do servidor. Uma pessoa autorizada precisa resolvê-la.',
  },
  session_expired: {
    title: 'Sessão expirada',
    guidance: 'Entre novamente para continuar. Suas alterações pendentes foram preservadas.',
  },
  access_denied: {
    title: 'Acesso negado',
    guidance: 'Você não tem autorização para acessar este ambiente. Fale com o administrador.',
  },
};

const ENDPOINT_LABELS: Record<EndpointKind, string> = {
  local: 'Dispositivo local',
  lan: 'Rede local (LAN)',
  cloud: 'Nuvem',
};

const isBlocking = (phase: InitializationPhase): phase is keyof typeof BLOCKING_MESSAGES => phase in BLOCKING_MESSAGES;

export function AppInitializationScreen({
  phase,
  endpoint,
  onRetry,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: AppInitializationScreenProps): React.JSX.Element {
  const [timedOutPhase, setTimedOutPhase] = useState<InitializationPhase | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const blocking = isBlocking(phase);
  const inProgress = !blocking && phase !== 'completed';

  // O teto vale por fase: nenhuma etapa deixa a interface bloqueada sem ação de recuperação.
  useEffect(() => {
    if (!inProgress) return;
    const timer = setTimeout(() => setTimedOutPhase(phase), timeoutMs);
    return () => clearTimeout(timer);
  }, [phase, inProgress, timeoutMs]);

  const timedOut = inProgress && timedOutPhase === phase;

  const showAlert = blocking || timedOut;
  useEffect(() => {
    if (showAlert) alertRef.current?.focus();
  }, [showAlert]);

  const endpointLabel = endpoint ? ENDPOINT_LABELS[endpoint] : null;
  const alert = blocking
    ? BLOCKING_MESSAGES[phase]
    : { title: 'A inicialização está demorando', guidance: 'A operação passou do tempo esperado. Você pode tentar novamente.' };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8 text-slate-900">
      <section className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-6 shadow-sm" aria-labelledby="init-title">
        <h1 id="init-title" className="text-lg font-semibold">FluxID</h1>

        {!blocking && (
          <div role="status" aria-live="polite" className="mt-4 flex items-center gap-3">
            {inProgress && (
              <span
                data-testid="init-spinner"
                aria-hidden="true"
                className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none"
              />
            )}
            <p>
              {PROGRESS_MESSAGES[phase as keyof typeof PROGRESS_MESSAGES]}
              {endpointLabel && <span className="block text-sm text-slate-700">Destino: {endpointLabel}</span>}
            </p>
          </div>
        )}

        {showAlert && (
          <div
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950 outline-none focus-visible:ring-2 focus-visible:ring-amber-800"
          >
            <p className="font-semibold">{alert.title}</p>
            <p className="mt-1 text-sm">{alert.guidance}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-11 min-w-11 items-center rounded-lg bg-slate-900 px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
