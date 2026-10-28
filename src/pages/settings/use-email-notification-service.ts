import { useMemo } from 'react';
import { EmailNotificationService } from '@/application/tracking/email-notification-service';
import { useConnectivity } from '@/app/connectivity-context';
import { useOnlineStatus } from '@/app/use-online-status';
import { useTenant } from '@/app/tenant/tenant-context';
import { createTrackingTransport } from '@/infrastructure/supabase/tracking-adapter';

// Serviço dos avisos sobre o destino ativo (mesmo transporte do rastreamento).
export function useEmailNotificationService(): { service: EmailNotificationService | null; organizationId: string; online: boolean } {
  const { client, config, result } = useConnectivity();
  const online = useOnlineStatus();
  const { activeOrganizationId } = useTenant();
  const endpoint = config?.endpoints.find((candidate) => candidate.kind === result.selectedEndpoint);
  const service = useMemo(() => (endpoint && client ? new EmailNotificationService(createTrackingTransport(endpoint, client), () => navigator.onLine !== false) : null), [client, endpoint]);
  return { service, organizationId: activeOrganizationId ?? '', online };
}
