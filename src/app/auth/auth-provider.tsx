import React, { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AuthContext, type AuthContextValue } from './auth-context';
import { useConnectivity } from '@/app/connectivity-context';
import { authReducer, initialAuthState, type AuthEvent } from '@/domain/identity/session';
import { SessionService, type SessionCheck } from '@/application/identity/session-service';
import { MfaService } from '@/application/identity/mfa-service';
import { createFetchSessionTransport, createMfaClient, createSupabaseSessionStore } from '@/infrastructure/supabase/session-adapters';

export interface AuthServices { service: SessionService; mfa: MfaService }

export interface AuthProviderProps {
  children: React.ReactNode;
  // Injeção para testes; em produção os serviços vêm do cliente único ativo da conectividade.
  services?: AuthServices | null;
  heartbeatMs?: number;
}

const DEFAULT_HEARTBEAT_MS = 60_000;
const ACTIVITY_EVENTS = ['keydown', 'pointerdown'] as const;

function eventFromCheck(result: SessionCheck): AuthEvent | null {
  switch (result.kind) {
    case 'active': return { type: 'session_active', aal: result.aal, mfaRequired: result.mfaRequired };
    case 'expired': return result.reason ? { type: 'session_expired', reason: result.reason } : { type: 'session_expired' };
    case 'revoked': return { type: 'session_revoked' };
    case 'missing': return { type: 'session_missing' };
    case 'unreachable': return null;
  }
}

export function AuthProvider({ children, services: injected, heartbeatMs = DEFAULT_HEARTBEAT_MS }: AuthProviderProps): React.JSX.Element {
  const { client, config, result: connectivity } = useConnectivity();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const activitySinceCheck = useRef(false);

  const endpoint = config?.endpoints.find((candidate) => candidate.kind === connectivity.selectedEndpoint);
  const built = useMemo<AuthServices | null>(() => {
    if (injected !== undefined) return injected;
    if (!client || !endpoint) return null;
    return {
      service: new SessionService(createFetchSessionTransport(endpoint), createSupabaseSessionStore(client)),
      mfa: new MfaService(createMfaClient(client)),
    };
  }, [injected, client, endpoint]);

  const resolving = connectivity.state === 'idle' || connectivity.state === 'probing';

  // Restaura somente sessão confirmada pelo servidor; sem servidor alcançável nenhum acesso é concedido.
  useEffect(() => {
    if (!built) {
      if (!resolving) dispatch({ type: 'session_missing' });
      return;
    }
    let cancelled = false;
    void built.service.check().then((result) => {
      if (cancelled) return;
      dispatch(eventFromCheck(result) ?? { type: 'session_missing' });
    });
    return () => { cancelled = true; };
  }, [built, resolving]);

  // Atividade confiável: só confirma a sessão no servidor quando o usuário realmente interagiu.
  const authenticated = state.status === 'authenticated' || state.status === 'mfa_required';
  useEffect(() => {
    if (!built || !authenticated) return;
    const markActivity = () => { activitySinceCheck.current = true; };
    for (const name of ACTIVITY_EVENTS) document.addEventListener(name, markActivity, { passive: true });
    const timer = setInterval(() => {
      if (!activitySinceCheck.current) return;
      activitySinceCheck.current = false;
      void built.service.check().then((result) => {
        const event = eventFromCheck(result);
        if (event && event.type !== 'session_active') dispatch(event);
      });
    }, heartbeatMs);
    return () => {
      clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) document.removeEventListener(name, markActivity);
    };
  }, [built, authenticated, heartbeatMs]);

  const login = useCallback<AuthContextValue['login']>(async (input) => {
    if (!built) return { kind: 'unavailable' };
    const outcome = await built.service.login(input);
    if (outcome.kind === 'authenticated') dispatch({ type: 'login_succeeded' });
    if (outcome.kind === 'mfa_required') dispatch({ type: 'login_requires_mfa' });
    return outcome;
  }, [built]);

  const logout = useCallback(async () => {
    await built?.service.logout();
    dispatch({ type: 'logout' });
  }, [built]);

  const confirmMfa = useCallback(async () => {
    if (!built) return false;
    const result = await built.service.check();
    if (result.kind === 'active' && result.aal === 'aal2') {
      dispatch({ type: 'mfa_verified' });
      return true;
    }
    return false;
  }, [built]);

  const verifySession = useCallback(async () => {
    if (!built) return false;
    try {
      return (await built.service.check()).kind === 'active';
    } catch {
      return false;
    }
  }, [built]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, logout, confirmMfa, verifySession, mfa: built?.mfa ?? null }),
    [state, login, logout, confirmMfa, verifySession, built],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
