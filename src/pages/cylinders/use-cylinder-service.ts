import { useMemo } from 'react';
import { CylinderService } from '@/application/cylinders/cylinder-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { createCylinderTransport } from '@/infrastructure/supabase/cylinder-adapter';

// Serviço de cilindros do destino ativo e a organização ativa vinda do servidor (RF-043). Sem conexão, o serviço devolve
// `offline` sem chamar o servidor; escritas nunca são enfileiradas (RF-035).
export function useCylinderService(): { service: CylinderService | null; organizationId: string; online: boolean } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(
    () => (endpoint && client ? new CylinderService(createCylinderTransport(endpoint, client), () => navigator.onLine !== false) : null),
    [client, endpoint],
  );
  return { service, organizationId: activeOrganizationId ?? '', online };
}
