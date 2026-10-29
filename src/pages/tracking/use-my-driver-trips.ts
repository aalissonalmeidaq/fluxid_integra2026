import { useEffect, useMemo, useState } from 'react';
import type { MyDriverTripsView } from '@/application/tracking/trip-tracking-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { createMyDriverTripsCache } from '@/infrastructure/tracking/my-driver-trips-cache';

// "Minha viagem" (Spec 015): as viagens da própria pessoa motorista, do servidor quando há conexão e, sem ela, a última resposta
// guardada para a mesma pessoa e empresa (com o horário, para a tela dizer que é informação anterior). Usado pela tela e pelo menu.
// O menu está no pacote de entrada: o serviço de rastreamento só é carregado na hora da consulta (orçamento da Spec 011).
export type MyDriverTripsLoad =
  | { kind: 'loading' }
  | { kind: 'ready'; view: MyDriverTripsView; savedAt: string | null }
  | { kind: 'offline' }
  | { kind: 'error' };

export function useMyDriverTrips(): { load: MyDriverTripsLoad; organizationId: string; online: boolean; retry: () => void } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const organizationId = useTenant().activeOrganizationId ?? '';
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const cache = useMemo(() => createMyDriverTripsCache(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [entry, setEntry] = useState<{ key: string; attempt: number; load: MyDriverTripsLoad } | null>(null);

  useEffect(() => {
    let active = true;
    void client?.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user?.id ?? null); });
    return () => { active = false; };
  }, [client]);

  const key = userId && organizationId ? `${userId}|${organizationId}` : '';
  const fetching = Boolean(key && online && endpoint && client);

  useEffect(() => {
    if (!fetching || !endpoint || !client || !userId) return undefined;
    let active = true;
    void Promise.all([import('@/application/tracking/trip-tracking-service'), import('@/infrastructure/supabase/tracking-adapter')])
      .then(([{ TripTrackingService }, { createTrackingTransport }]) =>
        new TripTrackingService(createTrackingTransport(endpoint, client), () => navigator.onLine !== false).myDriverTrips(organizationId))
      .then((outcome) => {
        if (!active) return;
        if (outcome.kind === 'success') cache.write(userId, organizationId, outcome.value, new Date().toISOString());
        const saved = cache.read(userId, organizationId);
        setEntry({ key, attempt, load: outcome.kind === 'success' ? { kind: 'ready', view: outcome.value, savedAt: null }
          : saved ? { kind: 'ready', view: saved.view, savedAt: saved.savedAt } : { kind: outcome.kind === 'offline' ? 'offline' : 'error' } });
      });
    return () => { active = false; };
  }, [cache, fetching, endpoint, client, key, userId, organizationId, attempt]);

  let load: MyDriverTripsLoad = { kind: 'loading' };
  if (key && !fetching) {
    // Sem conexão: a última resposta guardada desta pessoa e empresa, marcada como anterior.
    const saved = userId ? cache.read(userId, organizationId) : null;
    load = saved ? { kind: 'ready', view: saved.view, savedAt: saved.savedAt } : { kind: 'offline' };
  } else if (entry && entry.key === key && entry.attempt === attempt) load = entry.load;

  return { load, organizationId, online, retry: () => setAttempt((n) => n + 1) };
}
