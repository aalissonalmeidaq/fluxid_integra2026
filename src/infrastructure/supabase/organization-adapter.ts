import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationTransport } from '@/application/identity/organization-service';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

export function createOrganizationTransport(
  endpoint: PublicEndpoint,
  client: SupabaseClient,
  fetcher: typeof fetch = fetch,
): OrganizationTransport {
  const call = createFunctionTransport(endpoint, client, fetcher);
  return { call: (body) => call('manage-organizations', body) };
}
