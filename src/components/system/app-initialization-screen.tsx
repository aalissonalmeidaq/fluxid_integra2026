import { Button, Logo } from '@/design-system';
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
    <main className="flex min-h-dvh items-center justify-center bg-cinza-gelo px-4 py-8 text-grafite">
      <section className="w-full max-w-compacto rounded-card border border-borda-suave bg-branco p-6 shadow-card" aria-labelledby="init-title">
        <div className="flex justify-center">
          <Logo variant="vertical" width={120} decorative />
        </div>
        <h1 id="init-title" className="mt-4 text-center text-h3 font-semibold text-navy">FluxID</h1>

        {!blocking && (
          <div role="status" aria-live="polite" className="mt-4 flex items-center gap-4">
            {inProgress && (
              <span
                data-testid="init-spinner"
                aria-hidden="true"
                className="size-4 shrink-0 rounded-full border-2 border-azul-royal border-t-transparent motion-safe:animate-spin"
              />
            )}
            <p>
              {PROGRESS_MESSAGES[phase as keyof typeof PROGRESS_MESSAGES]}
              {endpointLabel && <span className="block text-corpo text-texto-secundario">Destino: {endpointLabel}</span>}
            </p>
          </div>
        )}

        {showAlert && (
          <div
            ref={alertRef}
            role="alert"
            tabIndex={-1}
            className="mt-4 rounded-card border border-alerta-faixa bg-alerta-fundo p-4 text-alerta-texto"
          >
            <p className="font-semibold">{alert.title}</p>
            <p className="mt-1 text-corpo">{alert.guidance}</p>
            <Button onClick={onRetry} className="mt-4">
              Tentar novamente
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
