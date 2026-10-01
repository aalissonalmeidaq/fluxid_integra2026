import { describe, expect, it } from 'vitest';
import { classifyConnectionFailure, permitsEndpointFallback } from './connection-failure-classifier';

describe('ConnectionFailureClassifier', () => {
  it.each([
    [{ statusCode: 401 }, 'authentication'],
    [{ code: 'session_expired' }, 'authentication'],
    [{ statusCode: 403 }, 'authorization'],
    [{ code: '42501' }, 'authorization'],
    [{ code: 'rls_violation' }, 'isolation'],
    [{ code: 'tenant_suspended' }, 'tenant'],
    [{ statusCode: 422 }, 'validation'],
    [{ code: '23505' }, 'integrity'],
    [{ statusCode: 400 }, 'configuration'],
  ] as const)('classifica %o como %s e bloqueia fallback', (input, expected) => {
    const failure = classifyConnectionFailure(input);
    expect(failure).toBe(expected);
    expect(permitsEndpointFallback(failure)).toBe(false);
  });

  it.each(['network', 'timeout', 'service_unavailable'] as const)('permite fallback somente para %s', (failure) => {
    expect(permitsEndpointFallback(failure)).toBe(true);
  });
});
