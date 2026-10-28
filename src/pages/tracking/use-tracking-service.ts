import { useMemo } from 'react';
import type { TrackingRealtimePort } from '@/application/tracking/tracking-realtime';
import { TripTrackingService } from '@/application/tracking/trip-tracking-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { createTrackingTransport } from '@/infrastructure/supabase/tracking-adapter';
import { createTrackingRealtimePort } from '@/infrastructure/supabase/tracking-realtime-adapter';

// Serviço de acompanhamento do destino ativo, o canal de tempo real e a organização ativa vinda do servidor (Spec 015). Sem conexão, o
// serviço devolve `offline` sem chamar o servidor; nenhuma posição é guardada no aparelho.
export function useTrackingService(): { service: TripTrackingService | null; realtime: TrackingRealtimePort | null; organizationId: string; online: boolean } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => (endpoint && client ? new TripTrackingService(createTrackingTransport(endpoint, client), () => navigator.onLine !== false) : null), [client, endpoint]);
  const realtime = useMemo(() => (client ? createTrackingRealtimePort(client) : null), [client]);
  return { service, realtime, organizationId: activeOrganizationId ?? '', online };
}
