import React, { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicEndpoint } from '@/infrastructure/supabase/function-transport';
import { useAuth } from '@/app/auth/auth-context';
import { useConnectivity } from '@/app/connectivity-context';
import { usePermissions } from '@/app/navigation/permissions-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { OfflineFieldContext, type OfflineFieldValue } from './offline-field-context';

const CONFIRMATION_REFRESH_MS = 60_000;

// Portões lidos pela fila na hora de registrar (nunca na renderização): a permissão atual e o instante da última confirmação do servidor.
class Gates {
  private allowed = false;
  private confirmed: Date | null = null;
  canOperate = (): boolean => this.allowed;
  confirmedAt = (): Date | null => this.confirmed;
  allow(value: boolean): void { this.allowed = value; }
  confirm(at: Date | null): void { this.confirmed = at; }
  // A conexão ativa só entra no envio dos anexos; trocá-la não deve refazer a fila.
  private live: { client: SupabaseClient; endpoint: PublicEndpoint } | null = null;
  connection = (): { client: SupabaseClient; endpoint: PublicEndpoint } | null => this.live;
  connect(live: { client: SupabaseClient; endpoint: PublicEndpoint } | null): void { this.live = live; }
}

// Monta a fila offline e a viagem guardada para a conta, a organização e o destino ativos (Spec 010, RF-002, RF-016). A fila nunca é compartilhada:
// outra conta, organização ou destino gera outro dono e não enxerga nada. A confirmação da sessão pelo servidor é só o instante em que o aparelho
// estava com conexão e autenticado; ela alimenta o teto de 8 horas do registro offline (o token nunca é guardado).
export function OfflineFieldProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const { database, activeOrganizationId } = useTenant();
  const { state, offlineAccess, offlineAccessStore } = useAuth();
  // Aberto sem servidor (acesso offline restrito): conta, destino e a última confirmação vêm do registro, não do cliente Supabase.
  const restored = state.status === 'authenticated' && state.offline === true && offlineAccess != null;
  const { permissions } = usePermissions();
  const [sessionActorId, setActorId] = useState<string | null>(null);
  const authenticated = state.status === 'authenticated';
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const endpointId = restored ? offlineAccess.endpointId : endpoint?.url ?? null;

  const actorId = restored ? offlineAccess.actorId : authenticated ? sessionActorId : null;
  const canOperate = permissions?.tenant.includes('trip.operate') ?? false;
  // Estado lido só dentro dos portões da fila, na hora de registrar (nunca na renderização); por isso fica fora do estado do React.
  const [gates] = useState(() => new Gates());
  useEffect(() => { gates.allow(canOperate); }, [gates, canOperate]);

  // A sessão guardada no navegador identifica a conta mesmo sem rede (leitura local, sem chamar o servidor).
  useEffect(() => {
    if (restored || !client || !authenticated) return undefined;
    let active = true;
    void client.auth.getSession().then(({ data }) => { if (active) setActorId(data.session?.user.id ?? null); }).catch(() => undefined);
    return () => { active = false; };
  }, [client, authenticated, restored]);

  useEffect(() => {
    if (!authenticated) { gates.confirm(null); return undefined; }
    // Sessão restaurada offline: vale o instante da última confirmação do servidor gravado no registro; só uma confirmação online o renova.
    if (restored) { gates.confirm(new Date(offlineAccess.confirmedAt)); return undefined; }
    const confirm = (): void => { if (navigator.onLine !== false) gates.confirm(new Date()); };
    confirm();
    // Aberto sem rede sem a marca de acesso offline: a última confirmação do servidor é a do registro guardado (só o instante, nunca o token).
    let active = true;
    if (navigator.onLine === false) {
      void offlineAccessStore?.read().then((stored) => {
        const confirmedAt = stored !== null && typeof stored === 'object' ? (stored as { confirmedAt?: unknown }).confirmedAt : undefined;
        if (active && typeof confirmedAt === 'string' && !Number.isNaN(Date.parse(confirmedAt))) gates.confirm(new Date(confirmedAt));
      }).catch(() => undefined);
    }
    const timer = setInterval(confirm, CONFIRMATION_REFRESH_MS);
    window.addEventListener('online', confirm);
    return () => { active = false; clearInterval(timer); window.removeEventListener('online', confirm); };
  }, [gates, authenticated, restored, offlineAccess, offlineAccessStore]);

  // O código da fila e dos anexos carrega só com a conta autenticada, inclusive a restaurada offline (fora do pacote de entrada). Na landing
  // e na entrada ele não é baixado: disputaria a rede com a página pública (Spec 015, T130; orçamento de LCP da Spec 011).
  const [factory, setFactory] = useState<typeof import('./offline-field-factory') | null>(null);
  useEffect(() => {
    if (!authenticated || factory) return undefined;
    let active = true;
    void import('./offline-field-factory').then((module) => { if (active) setFactory(module); }).catch(() => undefined);
    return () => { active = false; };
  }, [authenticated, factory]);
  useEffect(() => { gates.connect(client && endpoint ? { client, endpoint } : null); }, [gates, client, endpoint]);

  const value = useMemo<OfflineFieldValue | null>(() => {
    if (!factory || !database || !activeOrganizationId || !actorId || !endpointId || !authenticated) return null;
    return factory.createOfflineField({
      database, owner: { actorId, organizationId: activeOrganizationId, endpointId }, canOperate: gates.canOperate, confirmedAt: gates.confirmedAt,
      connection: gates.connection,
    });
  }, [factory, database, activeOrganizationId, actorId, endpointId, authenticated, gates]);

  return <OfflineFieldContext.Provider value={value}>{children}</OfflineFieldContext.Provider>;
}
