import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/auth/auth-context';
import { useConnectivity } from '@/app/connectivity-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { PermissionsService } from '@/application/identity/permissions-service';
import type { ActorPermissions } from '@/domain/navigation/visible-screens';
import { createFunctionTransport } from '@/infrastructure/supabase/function-transport';
import { PermissionsContext, type PermissionsContextValue } from './permissions-context';
import { createPermissionsCache } from './permissions-cache';

export const PERMISSIONS_REFRESH_MS = 60_000;
// Sem resposta neste prazo o menu cai para `error` e segue navegável com as telas sem exigência (RF-018).
export const QUERY_TIMEOUT_MS = 5_000;

export interface PermissionsProviderProps {
  children: React.ReactNode;
  // Injeção para testes; em produção o serviço vem do destino ativo da conectividade e a pessoa, da sessão do cliente.
  service?: PermissionsService | null;
  getUserId?: () => Promise<string | null>;
  refreshMs?: number;
  timeoutMs?: number;
}

interface Entry { key: string | null; status: 'loading' | 'ready' | 'error'; permissions: ActorPermissions | null }

// Mantém as permissões da pessoa no tenant ativo para o menu. O estado é chaveado por (pessoa, tenant): ao mudar a chave volta
// a `loading` antes de qualquer render do novo contexto, e respostas de consultas antigas são descartadas (RF-015, RF-017).
// O menu só mostra item restrito depois da confirmação do servidor; o cache da aba só é lido offline (RF-007, RF-020).
export function PermissionsProvider({
  children, service: injected, getUserId, refreshMs = PERMISSIONS_REFRESH_MS, timeoutMs = QUERY_TIMEOUT_MS,
}: PermissionsProviderProps): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const { state: authState } = useAuth();
  const { activeOrganizationId } = useTenant();
  const online = useOnlineStatus();
  const authenticated = authState.status === 'authenticated';
  const signedOut = authState.status === 'signed_out';
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const cache = useMemo(() => createPermissionsCache(), []);

  const service = useMemo(() => {
    if (injected !== undefined) return injected;
    if (!client || !endpoint) return null;
    const call = createFunctionTransport(endpoint, client);
    return new PermissionsService({ call: (body) => call('query-permissions', body) });
  }, [injected, client, endpoint]);

  const resolveUserId = useMemo(
    () => getUserId ?? (async () => (await client?.auth.getSession())?.data.session?.user.id ?? null),
    [getUserId, client],
  );

  // A pessoa vem da sessão; sem sessão autenticada nada é lembrado, e a origem da resolução invalida a anterior.
  const [identity, setIdentity] = useState<{ source: unknown; id: string | null } | null>(null);
  if (!authenticated && identity !== null) setIdentity(null);
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    resolveUserId()
      .then((id) => { if (active) setIdentity({ source: resolveUserId, id }); })
      .catch(() => { if (active) setIdentity({ source: resolveUserId, id: null }); });
    return () => { active = false; };
  }, [authenticated, resolveUserId]);
  const userId = authenticated && identity?.source === resolveUserId ? identity.id : null;

  const key = userId ? `${userId}|${activeOrganizationId ?? ''}` : null;
  const [entry, setEntry] = useState<Entry>({ key, status: 'loading', permissions: null });
  // Mudou a pessoa ou o tenant: descarta o estado anterior durante o render, antes de qualquer filho ver o novo contexto.
  if (entry.key !== key) setEntry({ key, status: 'loading', permissions: null });

  // Cada consulta recebe uma geração; só a mais recente da chave atual pode alterar o estado. O prazo de espera não conta
  // como nova geração, para que uma resposta tardia da consulta atual substitua o erro.
  const current = useRef({ key, generation: 0 });
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    current.current = { key, generation: current.current.generation + 1 };
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, [key]);

  const fetchNow = useCallback(() => {
    if (!service || !key || !userId) return;
    const generation = ++current.current.generation;
    const isCurrent = () => current.current.generation === generation && current.current.key === key;
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      if (isCurrent()) setEntry({ key, status: 'error', permissions: null });
    }, timeoutMs);
    timers.current.add(timer);
    void service.query(activeOrganizationId).then((outcome) => {
      clearTimeout(timer);
      timers.current.delete(timer);
      if (!isCurrent()) return;
      if (outcome.kind === 'success') {
        setEntry({ key, status: 'ready', permissions: outcome.value });
        cache.write(userId, activeOrganizationId, outcome.value);
      } else {
        setEntry({ key, status: 'error', permissions: null });
      }
    });
  }, [service, key, userId, activeOrganizationId, timeoutMs, cache]);

  // Consulta ao autenticar, ao mudar a chave e ao voltar a rede (a navegação por âncora recarrega o shell, e isso refaz o ciclo).
  useEffect(() => {
    if (online) fetchNow();
  }, [fetchNow, online]);

  // Atualização periódica só com a aba visível e online; pausa offline e refaz ao voltar (RF-016).
  useEffect(() => {
    if (!key || !online) return;
    const refresh = () => { if (document.visibilityState === 'visible') fetchNow(); };
    const timer = setInterval(refresh, refreshMs);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [key, online, fetchNow, refreshMs]);

  useEffect(() => { if (signedOut) cache.clear(); }, [signedOut, cache]);
  useEffect(() => { if (userId) cache.clearOthers(userId); }, [userId, cache]);

  const retry = useCallback(() => {
    if (key) setEntry({ key, status: 'loading', permissions: null });
    fetchNow();
  }, [key, fetchNow]);

  const value = useMemo<PermissionsContextValue>(() => {
    if (!authenticated) return { status: 'loading', permissions: null, retry };
    if (!online) {
      const known = entry.key === key && entry.status === 'ready' ? entry.permissions : null;
      const stored = known ?? (userId ? cache.read(userId, activeOrganizationId)?.codes ?? null : null);
      return { status: 'offline', permissions: stored, retry };
    }
    return { status: entry.status, permissions: entry.status === 'ready' ? entry.permissions : null, retry };
  }, [authenticated, online, entry, key, userId, activeOrganizationId, cache, retry]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
