import { useMemo } from 'react';
import { ReportService } from '@/application/reports/report-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { createFunctionTransport } from '@/infrastructure/supabase/function-transport';

// Serviço de relatórios do destino ativo (Spec 015, US5): só a chave publicável e o token da sessão; o servidor decide a leitura e a
// exportação. Sem conexão, o serviço devolve `offline` sem chamar o servidor.
export function useReportService(): { service: ReportService | null; organizationId: string; online: boolean; endpointUrl: string | null } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => {
    if (!endpoint || !client) return null;
    const call = createFunctionTransport(endpoint, client);
    return new ReportService({ call: (fn, body) => call(fn, body) }, () => navigator.onLine !== false);
  }, [client, endpoint]);
  return { service, organizationId: activeOrganizationId ?? '', online, endpointUrl: endpoint?.url ?? null };
}

