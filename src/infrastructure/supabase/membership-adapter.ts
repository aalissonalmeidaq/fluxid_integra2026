import type { SupabaseClient } from '@supabase/supabase-js';
import type { MembershipTransport } from '@/application/identity/membership-service';
import { createFunctionTransport, type PublicEndpoint } from './function-transport';

export function createMembershipTransport(
  endpoint: PublicEndpoint,
  client: SupabaseClient,
  fetcher: typeof fetch = fetch,
): MembershipTransport {
  return { call: createFunctionTransport(endpoint, client, fetcher) };
}
