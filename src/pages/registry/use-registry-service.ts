import { useMemo } from 'react';
import { GeocodingService } from '@/application/registry/geocoding-service';
import { PostalCodeService } from '@/application/registry/postal-code-service';
import { RegistryService } from '@/application/registry/registry-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { createRegistryTransport } from '@/infrastructure/supabase/registry-adapter';

// Serviços dos cadastros do destino ativo e a organização ativa vinda do servidor. Sem conexão, eles devolvem `offline` sem
// chamar o servidor; escritas nunca são enfileiradas (RF-045).
export function useRegistryService(): { service: RegistryService | null; postal: PostalCodeService | null; geocoder: GeocodingService | null; organizationId: string; online: boolean } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const services = useMemo(() => {
    if (!endpoint || !client) return { service: null, postal: null, geocoder: null };
    const transport = createRegistryTransport(endpoint, client);
    const isOnline = (): boolean => navigator.onLine !== false;
    return { service: new RegistryService(transport, isOnline), postal: new PostalCodeService(transport, isOnline), geocoder: new GeocodingService(transport, isOnline) };
  }, [client, endpoint]);
  return { ...services, organizationId: activeOrganizationId ?? '', online };
}
