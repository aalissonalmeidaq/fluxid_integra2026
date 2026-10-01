import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/app/auth/auth-context';
import { useConnectivity } from '@/app/connectivity-context';
import { SyncContext, type SyncContextValue } from '@/app/sync-context';
import { TenantContext, type TenantContextValue } from './tenant-context';
import { TenantContextService, type TenantSnapshot } from '@/application/identity/tenant-context-service';
import { SupabaseClientManager } from '@/infrastructure/connectivity/supabase-client-manager';
import { LocalDatabase } from '@/infrastructure/local-database/local-database';
import { createMembershipRecordSource } from '@/infrastructure/supabase/membership-source';
import { createTenantSyncRunner } from '@/infrastructure/synchronization/tenant-sync-runner';

export interface TenantProviderProps {
  children: React.ReactNode;
  // Injeção para testes; em produção o serviço vem do cliente único ativo da conectividade.
  service?: TenantContextService | null;
  createRunnerFor?: (organizationId: string) => SyncContextValue['createRunner'];
  refreshMs?: number;
}

const DEFAULT_REFRESH_MS = 60_000;
const IDLE: TenantSnapshot = { status: 'idle', selection: { kind: 'none' }, options: [], activeOrganizationId: null };

// Mantém um único tenant ativo por vez: resolve os vínculos elegíveis após a autenticação, isola a base local
// por organização e oferece o executor de sincronização do tenant ativo ao SyncGate (RF-026, RF-027, RF-051).
export function TenantProvider({ children, service: injected, createRunnerFor, refreshMs = DEFAULT_REFRESH_MS }: TenantProviderProps): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const { state: authState, verifySession } = useAuth();
  const authenticated = authState.status === 'authenticated';
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);

  const [database] = useState(() => new LocalDatabase());
  const [databaseState, setDatabaseState] = useState<'opening' | 'open' | 'failed'>('opening');
  useEffect(() => {
    if (injected !== undefined) return;
    let active = true;
    database.open()
      .then(() => { if (active) setDatabaseState('open'); })
      .catch(() => { if (active) setDatabaseState('failed'); });
    return () => { active = false; };
  }, [database, injected]);

  const service = useMemo(() => {
    if (injected !== undefined) return injected;
    if (!client || databaseState !== 'open') return null;
    return new TenantContextService({ database, fetchMemberships: createMembershipRecordSource(client) });
  }, [injected, client, database, databaseState]);

  const [snapshotOwner, setSnapshotOwner] = useState(service);
  const [snapshot, setSnapshot] = useState<TenantSnapshot>(() => service?.snapshot() ?? IDLE);
  const [switching, setSwitching] = useState(false);

  // Trocar o serviço (novo destino ou sessão) descarta o estado do anterior.
  if (snapshotOwner !== service) {
    setSnapshotOwner(service);
    setSnapshot(service?.snapshot() ?? IDLE);
  }

  useEffect(() => {
    if (!service) return;
    return service.subscribe(() => setSnapshot(service.snapshot()));
  }, [service]);

  // Sem sessão autenticada o contexto é liberado e a base local travada; a pendência do tenant fica preservada e inacessível.
  useEffect(() => {
    if (!service) return;
    if (authenticated) void service.load();
    else void service.release();
  }, [service, authenticated]);

  useEffect(() => () => { void service?.release(); }, [service]);

  useEffect(() => {
    if (!service || !authenticated) return;
    const timer = setInterval(() => void service.load(), refreshMs);
    return () => clearInterval(timer);
  }, [service, authenticated, refreshMs]);

  const select = useCallback<TenantContextValue['select']>(async (organizationId) => {
    if (!service) return { ok: false, reason: 'unavailable' };
    const outcome = await service.select(organizationId);
    if (outcome.ok) setSwitching(false);
    return outcome;
  }, [service]);

  const reload = useCallback(async () => { await service?.load(); }, [service]);
  const reloadVoid = useCallback(() => { void service?.load(); }, [service]);
  const beginSwitch = useCallback(() => setSwitching(true), []);
  const cancelSwitch = useCallback(() => setSwitching(false), []);

  const activeOrganizationId = snapshot.activeOrganizationId;
  // Sem base local não há contexto de tenant: erro recuperável em vez de bloqueio indefinido.
  const databaseFailed = injected === undefined && databaseState === 'failed';
  const status = authenticated && databaseFailed ? 'error' : authenticated && service && snapshot.status === 'idle' ? 'loading' : snapshot.status;
  // Resolvendo: autenticado e o serviço ainda não terminou a primeira carga (ou a base local ainda está abrindo).
  const resolving = authenticated && !databaseFailed && (service ? snapshot.status === 'idle' : injected === undefined && Boolean(client));

  const value = useMemo<TenantContextValue>(
    () => ({ status, selection: snapshot.selection, options: snapshot.options, activeOrganizationId, switching, select, beginSwitch, cancelSwitch, reload }),
    [status, snapshot.selection, snapshot.options, activeOrganizationId, switching, select, beginSwitch, cancelSwitch, reload],
  );

  // Um executor por tenant ativo: trocar de tenant troca o executor e o SyncGate bloqueia e sincroniza o novo contexto.
  const createRunner = useMemo<SyncContextValue['createRunner']>(() => {
    if (!activeOrganizationId) return null;
    if (createRunnerFor) return createRunnerFor(activeOrganizationId);
    if (!client || !endpoint || !service) return null;
    const manager = new SupabaseClientManager<SupabaseClient>(() => client);
    void manager.activate(endpoint);
    return createTenantSyncRunner({
      database,
      clientManager: manager,
      organizationId: activeOrganizationId,
      verifySession: verifySession ?? (async () => false),
      confirmTenant: () => service.confirm(),
    });
  }, [activeOrganizationId, createRunnerFor, client, endpoint, service, database, verifySession]);

  const syncValue = useMemo<SyncContextValue>(() => ({ createRunner, resolving, retryResolving: reloadVoid }), [createRunner, resolving, reloadVoid]);

  return (
    <TenantContext.Provider value={value}>
      <SyncContext.Provider value={syncValue}>{children}</SyncContext.Provider>
    </TenantContext.Provider>
  );
}
