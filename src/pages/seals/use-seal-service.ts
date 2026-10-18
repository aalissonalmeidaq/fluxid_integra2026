import { useMemo } from 'react';
import { SealService } from '@/application/seals/seal-service';
import { GeocodingService } from '@/application/registry/geocoding-service';
import type { RealtimePort } from '@/application/seals/seal-realtime';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { createSealTransport } from '@/infrastructure/supabase/seal-adapter';
import { createRegistryTransport } from '@/infrastructure/supabase/registry-adapter';
import { createSealRealtimePort } from '@/infrastructure/supabase/seal-realtime-adapter';

// Serviço do lacre do destino ativo, o canal de tempo real e a organização ativa vinda do servidor (Spec 012). Sem conexão, o serviço
// devolve `offline` sem chamar o servidor: comandos de lacre nunca entram na fila do aparelho (RF-043).
export function useSealService(): { service: SealService | null; geocoder: GeocodingService | null; realtime: RealtimePort | null; organizationId: string; online: boolean } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => (endpoint && client ? new SealService(createSealTransport(endpoint, client), () => navigator.onLine !== false) : null), [client, endpoint]);
  const geocoder = useMemo(() => (endpoint && client ? new GeocodingService(createRegistryTransport(endpoint, client), () => navigator.onLine !== false) : null), [client, endpoint]);
  const realtime = useMemo(() => (client ? createSealRealtimePort(client) : null), [client]);
  return { service, geocoder, realtime, organizationId: activeOrganizationId ?? '', online };
}
