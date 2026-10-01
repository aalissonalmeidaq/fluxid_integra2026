import { createClient } from '@supabase/supabase-js';
import type { ValidatedEndpoint } from '@/config/environment';

interface ManagedClient {
  auth: { signOut: (options: { scope: 'local' }) => Promise<unknown> };
}

type ClientFactory<T extends ManagedClient> = (url: string, publishableKey: string) => T;
interface ActivationOptions {
  authenticateAtDestination?: (context: { endpoint: ValidatedEndpoint['kind'] }) => Promise<unknown>;
}

export class SupabaseClientManager<T extends ManagedClient = ManagedClient> {
  private activeClient?: T;
  private activeEndpoint?: ValidatedEndpoint;

  constructor(
    private readonly factory: ClientFactory<T> = ((url, key) => createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }) as unknown as T),
  ) {}

  current(): T | undefined {
    return this.activeClient;
  }

  currentEndpoint(): ValidatedEndpoint | undefined {
    return this.activeEndpoint;
  }

  async activate(endpoint: ValidatedEndpoint, options: ActivationOptions = {}) {
    if (this.activeClient) await this.activeClient.auth.signOut({ scope: 'local' });
    this.activeClient = this.factory(endpoint.url, endpoint.publishableKey);
    this.activeEndpoint = endpoint;
    const requiresReauthentication = endpoint.kind === 'lan' || endpoint.kind === 'local';
    if (requiresReauthentication && options.authenticateAtDestination) {
      await options.authenticateAtDestination({ endpoint: endpoint.kind });
    }
    return { client: this.activeClient, requiresReauthentication };
  }

  async invalidate(): Promise<void> {
    if (!this.activeClient) return;
    await this.activeClient.auth.signOut({ scope: 'local' });
    this.activeClient = undefined;
    this.activeEndpoint = undefined;
  }
}
