import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/app/auth/auth-context';
import { useConnectivity } from '@/app/connectivity-context';
import { usePermissions } from '@/app/navigation/permissions-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { startFieldSyncTriggers } from '@/application/field/field-sync-service';
import { FieldSyncContext, type FieldSyncValue } from './field-sync-context';
import { useOfflineField } from './offline-field-context';

class OperateGate {
  private allowed = false;
  canOperate = (): boolean => this.allowed;
  allow(value: boolean): void { this.allowed = value; }
}

// Monta o envio da fila de campo e as decisões sobre conflitos para a conta, a organização e o destino ativos (Spec 010, RF-008, RF-013, RF-016). Só existe com a
// sessão confirmada pelo servidor (nunca com a sessão restaurada offline). Dispara ao abrir, ao voltar a conexão e a cada 30 segundos com pendência; o botão
// "Enviar agora" chama `sync.syncNow()`. Cada envio reconfirma a sessão antes de mandar qualquer coisa e roda sob a trava de aba.
export function FieldSyncProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { client, config, result } = useConnectivity();
  const { state, verifySession } = useAuth();
  const { database, activeOrganizationId } = useTenant();
  const field = useOfflineField();
  const { permissions } = usePermissions();
  // A permissão atual é lida só na hora de decidir sobre um conflito, nunca na renderização.
  const [gate] = useState(() => new OperateGate());
  const allowed = permissions?.tenant.includes('trip.operate') ?? false;
  useEffect(() => { gate.allow(allowed); }, [gate, allowed]);
  const [resolvedActorId, setActorId] = useState<string | null>(null);
  const live = state.status === 'authenticated' && state.offline !== true;
  const actorId = live ? resolvedActorId : null;
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const endpointId = endpoint?.url ?? null;

  // A sessão guardada no navegador identifica a conta mesmo sem rede (leitura local, sem chamar o servidor).
  useEffect(() => {
    if (!client || !live) return undefined;
    let active = true;
    void client.auth.getSession().then(({ data }) => { if (active) setActorId(data.session?.user.id ?? null); }).catch(() => undefined);
    return () => { active = false; };
  }, [client, live]);

  // O código do envio carrega depois de o aplicativo abrir (fora do pacote de entrada).
  const [factory, setFactory] = useState<typeof import('./field-sync-factory') | null>(null);
  useEffect(() => {
    let active = true;
    void import('./field-sync-factory').then((module) => { if (active) setFactory(module); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const value = useMemo<FieldSyncValue | null>(() => {
    if (!factory || !live || !client || !endpoint || !endpointId || !database || !activeOrganizationId || !actorId || !field) return null;
    return factory.createFieldSync({ client, endpoint, endpointId, database, activeOrganizationId, actorId, field, verifySession, canOperate: gate.canOperate });
  }, [factory, live, client, endpoint, endpointId, database, activeOrganizationId, actorId, field, verifySession, gate]);

  useEffect(() => {
    if (!value || !field) return undefined;
    const stop = startFieldSyncTriggers({
      service: value.sync,
      hasPending: async () => {
        const counts = await field.queue.counts(true);
        return counts.pending + counts.syncing > 0 || (await field.attachments.usage()).count > 0;
      },
    });
    return stop;
  }, [value, field]);

  return <FieldSyncContext.Provider value={value}>{children}</FieldSyncContext.Provider>;
}
