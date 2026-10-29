import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { systemClock } from '@/application/tracking/tracking-ports';
import { ManageTrackingGateway } from '@/application/tracking/tracking-gateway';
import { DriverTrackingCoordinator, type DriverTrackingState } from '@/application/tracking/tracking-sync-service';
import { TripTrackingService } from '@/application/tracking/trip-tracking-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { getDeviceId } from '@/infrastructure/local-database/device-id';
import { createTrackingTransport } from '@/infrastructure/supabase/tracking-adapter';
import { createCapacitorLocationAdapter, nativeTrackingPlugin } from '@/infrastructure/tracking/capacitor-location-adapter';
import { IndexedDbTrackingQueue } from '@/infrastructure/tracking/tracking-queue';
import { createWebLocationAdapter } from '@/infrastructure/tracking/web-location-adapter';
import { sharedDriverCoordinator } from './driver-tracking-registry';

// Coleta do motorista na viagem em andamento (Spec 015, US2): monta a coordenação com a fila do aparelho, o adaptador da plataforma
// (serviço nativo no Android; navegador só com a tela aberta) e a porta do servidor do destino ativo. Só aparece para a pessoa que é a
// motorista da viagem; começa com a viagem em andamento, envia a fila a cada minuto e quando a conexão volta, e para quando a viagem
// termina. Nenhuma regra de proximidade aqui: ela é do banco.
const FLUSH_EVERY_MS = 60_000;

// A pessoa da sessão (sub do token), quando o cliente ainda não carregou o objeto do usuário. Só identifica o dono da fila no aparelho.
function subjectOf(token: string | undefined): string | null {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

export function useDriverTracking(organizationId: string, tripId: string, tripStatus: string): { state: DriverTrackingState | null; enable: () => void } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const [userId, setUserId] = useState<string | null>(null);
  const [isDriver, setIsDriver] = useState(false);

  useEffect(() => {
    let active = true;
    void client?.auth.getSession().then(({ data }) => { if (active) setUserId(data.session?.user?.id ?? subjectOf(data.session?.access_token)); });
    return () => { active = false; };
  }, [client]);

  const transport = useMemo(() => (endpoint && client ? createTrackingTransport(endpoint, client) : null), [endpoint, client]);

  useEffect(() => {
    if (!transport || !organizationId || !tripId || !online) return undefined;
    let active = true;
    void new TripTrackingService(transport, () => navigator.onLine !== false).driverStatus(organizationId, tripId)
      .then((outcome) => { if (active) setIsDriver(outcome.kind === 'success' && outcome.value.isDriver); });
    return () => { active = false; };
  }, [transport, organizationId, tripId, online]);

  // A mesma coordenação para o painel da viagem e o mantenedor do menu (driver-tracking-registry.ts).
  const coordinator = useMemo(() => {
    const endpointId = result.selectedEndpoint;
    if (!transport || !userId || !isDriver || !endpointId) return null;
    return sharedDriverCoordinator(`${endpointId}|${userId}|${organizationId}|${tripId}`, () => {
      const native = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
      return new DriverTrackingCoordinator({
        queue: new IndexedDbTrackingQueue(),
        location: native ? createCapacitorLocationAdapter(nativeTrackingPlugin(), { androidSdk: 33 }) : createWebLocationAdapter(),
        gateway: new ManageTrackingGateway(transport), clock: systemClock, isOnline: () => navigator.onLine !== false,
        context: { userId, organizationId, endpointId, deviceInstallationId: getDeviceId() },
      });
    });
  }, [transport, userId, isDriver, organizationId, tripId, result.selectedEndpoint]);

  const subscribe = useCallback((notify: () => void) => (coordinator ? coordinator.subscribe(notify) : () => undefined), [coordinator]);
  const snapshot = useCallback((): DriverTrackingState | null => coordinator?.state() ?? null, [coordinator]);
  const state = useSyncExternalStore(subscribe, snapshot, () => null);

  // Viagem em andamento: inicia (a sessão é idempotente no servidor). Viagem encerrada: para a coleta e envia o que faltou.
  useEffect(() => {
    if (!coordinator) return;
    const phase = coordinator.state().phase;
    if (tripStatus === 'in_progress' && (phase === 'idle' || phase === 'error') && online) void coordinator.start(tripId);
    if ((tripStatus === 'completed' || tripStatus === 'cancelled') && phase !== 'idle' && phase !== 'stopped') {
      void coordinator.stop(tripStatus === 'cancelled' ? 'cancelled' : 'completed');
    }
  }, [coordinator, tripStatus, tripId, online]);

  useEffect(() => {
    if (!coordinator) return undefined;
    const flush = () => void coordinator.flush();
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flush);
    };
  }, [coordinator]);

  const enable = useCallback(() => { if (coordinator) void coordinator.start(tripId); }, [coordinator, tripId]);
  return { state: isDriver ? state : null, enable };
}
