import { useMemo } from 'react';
import { TripService } from '@/application/trips/trip-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { useOfflineField } from '@/app/field/offline-field-context';
import { createTripTransport } from '@/infrastructure/supabase/trip-adapter';

// Serviço das viagens do destino ativo e a organização ativa vinda do servidor. Sem conexão, ele devolve `offline` sem chamar o servidor;
// só as quatro operações de campo entram na fila do aparelho e a viagem abre da cópia guardada (Spec 010).
export function useTripService(): { service: TripService | null; organizationId: string; online: boolean } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const offlineField = useOfflineField();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => {
    if (!endpoint || !client) return null;
    return new TripService(createTripTransport(endpoint, client), () => navigator.onLine !== false, offlineField?.queue, undefined, offlineField?.trips, endpoint.url);
  }, [client, endpoint, offlineField]);
  return { service, organizationId: activeOrganizationId ?? '', online };
}
