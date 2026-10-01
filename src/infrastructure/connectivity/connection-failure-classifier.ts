export type ConnectionFailure =
  | 'cancelled' | 'timeout' | 'network' | 'service_unavailable'
  | 'authentication' | 'authorization' | 'isolation' | 'tenant'
  | 'validation' | 'integrity' | 'configuration' | 'incompatible_contract' | 'unknown';

export interface FailureMetadata { statusCode?: number; code?: string; timeout?: boolean; networkError?: boolean }

export function classifyConnectionFailure(meta: FailureMetadata): ConnectionFailure {
  if (meta.timeout) return 'timeout';
  if (meta.networkError) return 'network';
  if (meta.statusCode !== undefined && meta.statusCode >= 500) return 'service_unavailable';
  if (meta.statusCode === 401 || meta.code === 'session_expired' || meta.code === 'invalid_jwt') return 'authentication';
  if (meta.statusCode === 403 || meta.code === '42501') return 'authorization';
  if (meta.code === 'rls_violation') return 'isolation';
  if (meta.code === 'tenant_suspended' || meta.code === 'tenant_inactive') return 'tenant';
  if (meta.code === '23502' || meta.code === '23503' || meta.code === '23505') return 'integrity';
  if (meta.statusCode === 422) return 'validation';
  if (meta.statusCode === 400 || meta.statusCode === 404) return 'configuration';
  return 'unknown';
}

export function permitsEndpointFallback(failure: ConnectionFailure): boolean {
  return failure === 'network' || failure === 'timeout' || failure === 'service_unavailable';
}
