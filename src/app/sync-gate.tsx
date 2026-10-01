import React, { useEffect, useState } from 'react';
import { useAuth } from './auth/auth-context';
import { useSync } from './sync-context';
import { AppInitializationScreen, type InitializationPhase } from '@/components/system/app-initialization-screen';
import type { SyncRunResult } from '@/infrastructure/synchronization/sync-coordinator';

// Resultado da sincronização traduzido para os estados da tela de inicialização (RF-060).
function blockingPhase(result: SyncRunResult): InitializationPhase | null {
  switch (result.state) {
    case 'ready':
    case 'cancelled':
      return null;
    case 'conflict':
      return 'conflict';
    case 'session_expired':
      return 'session_expired';
    case 'gate_failed':
      return result.failedGate === 'session' ? 'session_expired' : result.failedGate === 'tenant' ? 'access_denied' : 'failed';
    case 'interrupted':
      return 'failed';
  }
}

// Segundo portão da inicialização: depois da conexão e com sessão autenticada, sincroniza (push antes de pull)
// e confirma sessão, tenant e consistência antes de liberar a área protegida (RF-051, RF-052).
export function SyncGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { state, logout } = useAuth();
  const { createRunner, resolving = false, retryResolving } = useSync();
  const authenticated = state.status === 'authenticated';
  const [released, setReleased] = useState(false);
  const [phase, setPhase] = useState<InitializationPhase>('inspecting');
  const [attempt, setAttempt] = useState(0);
  const [wasAuthenticated, setWasAuthenticated] = useState(authenticated);
  // Funções em useState são tratadas como inicializador/atualizador: o executor é guardado embrulhado.
  const [previousRunner, setPreviousRunner] = useState(() => createRunner);

  // Cada autenticação e cada novo executor (troca de tenant) começam uma nova inicialização:
  // a liberação anterior não vale para o novo contexto.
  if (wasAuthenticated !== authenticated || previousRunner !== createRunner) {
    setWasAuthenticated(authenticated);
    setPreviousRunner(() => createRunner);
    setReleased(false);
    setPhase('inspecting');
  }

  useEffect(() => {
    if (!authenticated || !createRunner) return;
    let active = true;
    const controller = new AbortController();
    createRunner((next) => { if (active) setPhase(next); })
      .run({ signal: controller.signal })
      .then((result) => {
        if (!active) return;
        const blocking = blockingPhase(result);
        if (blocking) setPhase(blocking);
        else if (result.state === 'ready') setReleased(true);
      })
      .catch(() => { if (active) setPhase('failed'); });
    return () => { active = false; controller.abort(); };
  }, [authenticated, createRunner, attempt]);

  // Enquanto o tenant é resolvido não há executor ainda, mas a área também não abre. Sem executor e sem resolução
  // pendente não há o que sincronizar. O bloqueio vale desde a primeira renderização autenticada.
  const blocked = authenticated && (resolving || (createRunner !== null && !released));
  if (!blocked) return <>{children}</>;

  const retry = (): void => {
    // Sessão expirada não se resolve repetindo a sincronização: é preciso entrar de novo.
    if (phase === 'session_expired') void logout();
    else if (resolving && !createRunner) retryResolving?.();
    else {
      setPhase('inspecting');
      setAttempt((current) => current + 1);
    }
  };
  return <AppInitializationScreen phase={phase} onRetry={retry} />;
}
