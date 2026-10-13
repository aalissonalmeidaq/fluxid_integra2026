import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-context';
import { useConnectivity } from '@/app/connectivity-context';
import { usePermissions } from '@/app/navigation/permissions-context';
import { useTenant } from '@/app/tenant/tenant-context';
import { buildOfflineAccess } from '@/domain/identity/offline-access';

const REFRESH_MS = 60_000;

export interface OfflineAccessRecorderProps {
  // Quem é a pessoa (a sessão guardada no navegador a identifica sem chamar o servidor); injetável nos testes.
  getActorId?: () => Promise<string | null>;
  now?: () => Date;
}

// Grava o registro do acesso offline restrito (Spec 010, RF-016, RF-016a; research.md §19a) **só** depois de sessão, tenant e permissões confirmados
// pelo servidor com o aparelho online, e o atualiza a cada confirmação (o armazenamento limita a uma gravação por minuto). Nunca grava com a sessão
// restaurada offline, sem permissões confirmadas ou sem destino; o registro não leva token nem dado de domínio.
export function OfflineAccessRecorder({ getActorId, now = () => new Date() }: OfflineAccessRecorderProps): null {
  const { client, config, result } = useConnectivity();
  const { state, offlineAccessStore } = useAuth();
  const tenant = useTenant();
  const { status, permissions } = usePermissions();
  const [resolvedActorId, setActorId] = useState<string | null>(null);
  const confirmed = state.status === 'authenticated' && state.offline !== true;
  // Sem sessão confirmada a conta lembrada não vale (derivado, sem estado extra).
  const actorId = confirmed ? resolvedActorId : null;
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const endpointId = endpoint?.url ?? null;

  useEffect(() => {
    if (!confirmed) return undefined;
    let active = true;
    const resolve = getActorId ?? (async () => (await client?.auth.getSession())?.data.session?.user.id ?? null);
    resolve().then((id) => { if (active) setActorId(id); }).catch(() => { if (active) setActorId(null); });
    return () => { active = false; };
  }, [confirmed, client, getActorId]);

  const option = tenant.selection.kind === 'selected' ? tenant.selection.option : null;
  const aal = state.status === 'authenticated' ? state.aal : null;
  const codes = permissions?.tenant ?? null;
  const ready = Boolean(offlineAccessStore && confirmed && aal && actorId && endpointId && option && tenant.status === 'ready'
    && tenant.activeOrganizationId === option.organizationId && status === 'ready' && codes);

  const latest = useRef({ ready, actorId, endpointId, option, aal, codes });
  useEffect(() => { latest.current = { ready, actorId, endpointId, option, aal, codes }; });

  useEffect(() => {
    if (!ready || !offlineAccessStore) return undefined;
    const record = (): void => {
      // Sem rede, a última confirmação continua valendo: não se regrava com um instante que o servidor não confirmou.
      if (navigator.onLine === false) return;
      const current = latest.current;
      if (!current.ready || !current.actorId || !current.endpointId || !current.option || !current.aal || !current.codes) return;
      void offlineAccessStore.save(buildOfflineAccess({
        actorId: current.actorId, organizationId: current.option.organizationId, organizationName: current.option.displayName, organizationKind: current.option.kind,
        endpointId: current.endpointId, aal: current.aal, displayName: '', permissions: current.codes, confirmedAt: now(),
      }));
    };
    record();
    const timer = setInterval(record, REFRESH_MS);
    return () => clearInterval(timer);
    // `now` e o armazenamento são estáveis; o registro é refeito quando o contexto confirmado muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, offlineAccessStore, actorId, endpointId, option?.organizationId, aal, codes?.join('|')]);

  return null;
}
