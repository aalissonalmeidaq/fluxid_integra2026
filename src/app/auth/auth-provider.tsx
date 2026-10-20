import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AuthContext, type AuthContextValue, type OfflineAccessStorePort } from './auth-context';
import { useConnectivity } from '@/app/connectivity-context';
import { authReducer, initialAuthState, type AuthEvent } from '@/domain/identity/session';
import { SessionService, type SessionCheck } from '@/application/identity/session-service';
import { restoreOfflineAccess, type OfflineAccessRecord } from '@/domain/identity/offline-access';
import { OfflineAccessStore } from '@/infrastructure/local-database/offline-access-store';
import { createFetchSessionTransport, createSupabaseSessionStore } from '@/infrastructure/supabase/session-adapters';

export interface AuthServices { service: SessionService }

export interface AuthProviderProps {
  children: React.ReactNode;
  // Injeção para testes; em produção os serviços vêm do cliente único ativo da conectividade.
  services?: AuthServices | null;
  heartbeatMs?: number;
  // Acesso offline restrito (Spec 010): `undefined` usa a base real (só em produção); `null` desliga (testes, sem o recurso).
  offlineAccess?: OfflineAccessStorePort | null;
  now?: () => Date;
}

const DEFAULT_HEARTBEAT_MS = 60_000;
const ACTIVITY_EVENTS = ['keydown', 'pointerdown'] as const;

function eventFromCheck(result: SessionCheck): AuthEvent | null {
  switch (result.kind) {
    case 'active': return { type: 'session_active', aal: result.aal };
    case 'expired': return result.reason ? { type: 'session_expired', reason: result.reason } : { type: 'session_expired' };
    case 'revoked': return { type: 'session_revoked' };
    case 'missing': return { type: 'session_missing' };
    case 'unreachable': return null;
  }
}

export function AuthProvider({ children, services: injected, heartbeatMs = DEFAULT_HEARTBEAT_MS, offlineAccess: offlineInjected, now = () => new Date() }: AuthProviderProps): React.JSX.Element {
  const { client, config, result: connectivity } = useConnectivity();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const activitySinceCheck = useRef(false);
  const [offlineRecord, setOfflineRecord] = useState<OfflineAccessRecord | null>(null);
  // Em produção a base é a real; com serviços injetados (testes) o recurso só liga se o teste o fornecer.
  const offlineStore = useMemo<OfflineAccessStorePort | null>(
    () => (offlineInjected !== undefined ? offlineInjected : injected === undefined ? new OfflineAccessStore() : null), [offlineInjected, injected]);

  const endpoint = config?.endpoints.find((candidate) => candidate.kind === connectivity.selectedEndpoint);
  const built = useMemo<AuthServices | null>(() => {
    if (injected !== undefined) return injected;
    if (!client || !endpoint) return null;
    return {
      service: new SessionService(createFetchSessionTransport(endpoint), createSupabaseSessionStore(client)),
    };
  }, [injected, client, endpoint]);

  const resolving = connectivity.state === 'idle' || connectivity.state === 'probing';

  // Restaura a sessão confirmada pelo servidor. Sem servidor alcançável, só volta pelo acesso offline restrito (Spec 010, RF-016a): registro válido e
  // a menos de 8 horas da última confirmação; sem ele, nenhum acesso é concedido.
  useEffect(() => {
    let cancelled = false;
    const restoreOrSignOut = async () => {
      const stored = offlineStore ? await offlineStore.read() : null;
      if (cancelled) return;
      const restored = restoreOfflineAccess(stored, now());
      if (restored.ok) {
        setOfflineRecord(restored.record);
        dispatch({ type: 'session_offline_restored', aal: restored.record.aal });
        return;
      }
      setOfflineRecord(null);
      if (restored.reason === 'expired') {
        await offlineStore?.clear();
        dispatch({ type: 'session_expired', reason: 'timebox' });
      } else dispatch({ type: 'session_missing' });
    };
    if (!built) {
      if (!resolving) void restoreOrSignOut();
      return () => { cancelled = true; };
    }
    void built.service.check().then(async (result) => {
      if (cancelled) return;
      if (result.kind === 'unreachable') { await restoreOrSignOut(); return; }
      setOfflineRecord(null);
      // Sessão expirada, revogada ou ausente: o aparelho deixa de poder abrir offline.
      if (result.kind !== 'active') await offlineStore?.clear();
      dispatch(eventFromCheck(result) ?? { type: 'session_missing' });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` e a base do acesso offline não mudam a decisão de restaurar
  }, [built, resolving]);

  // Atividade confiável: só confirma a sessão no servidor quando o usuário realmente interagiu.
  const authenticated = state.status === 'authenticated';
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
    return outcome;
  }, [built]);

  const logout = useCallback(async () => {
    await built?.service.logout();
    // Sair da conta tira a permissão de abrir offline; a fila e os anexos pendentes não são tocados.
    await offlineStore?.clear();
    setOfflineRecord(null);
    dispatch({ type: 'logout' });
  }, [built, offlineStore]);

  const verifySession = useCallback(async () => {
    if (!built) return false;
    try {
      return (await built.service.check()).kind === 'active';
    } catch {
      return false;
    }
  }, [built]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, logout, verifySession, offlineAccess: state.status === 'authenticated' && state.offline ? offlineRecord : null, offlineAccessStore: offlineStore }),
    [state, login, logout, verifySession, offlineRecord, offlineStore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
