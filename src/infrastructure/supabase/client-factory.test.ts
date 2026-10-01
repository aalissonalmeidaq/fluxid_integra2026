import { describe, it, expect, vi } from 'vitest';
import { createSelectedClient } from './client-factory';
import { AppConfig } from '@/config/environment';
import { ResolutionResult } from './connection-state';
import { MOCK_URLS, MOCK_KEYS } from '@/test/fixtures/connectivity';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string) => ({
    mockClient: true,
    supabaseUrl: url,
    supabaseKey: key,
  })),
}));

describe('Fábrica de Cliente Supabase (Client Factory)', () => {
  const config: AppConfig = {
    connectionMode: 'auto',
    probeTimeoutMs: 2000,
    contractVersion: '1',
    endpoints: [
      { kind: 'local', url: MOCK_URLS.local, publishableKey: MOCK_KEYS.local },
      { kind: 'lan', url: MOCK_URLS.lan, publishableKey: MOCK_KEYS.lan },
    ],
  };

  it('cria cliente para resultado connected', () => {
    const result: ResolutionResult = {
      state: 'connected',
      selectedEndpoint: 'local',
      attempts: [{ endpoint: 'local', startedAt: 0, durationMs: 10, outcome: 'success', statusCode: 200 }],
    };

    const client = createSelectedClient(result, config);
    expect(client).toBeDefined();
  });

  it('cria cliente para resultado degraded', () => {
    const result: ResolutionResult = {
      state: 'degraded',
      selectedEndpoint: 'lan',
      attempts: [
        { endpoint: 'local', startedAt: 0, durationMs: 50, outcome: 'timeout' },
        { endpoint: 'lan', startedAt: 50, durationMs: 10, outcome: 'success', statusCode: 200 },
      ],
    };

    const client = createSelectedClient(result, config);
    expect(client).toBeDefined();
  });

  it('recusa criar cliente para estados idle, probing, blocked e offline', () => {
    const invalidStates = ['idle', 'probing', 'blocked', 'offline'] as const;

    for (const state of invalidStates) {
      const result: ResolutionResult = { state, attempts: [] };
      expect(() => createSelectedClient(result, config)).toThrow();
    }
  });
});
