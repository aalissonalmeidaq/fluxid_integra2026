import { describe, expect, it } from 'vitest';
import { createEndpointConfiguration } from './endpoint-configuration';

const base = {
  VITE_SUPABASE_CONNECTION_MODE: 'auto',
  VITE_SUPABASE_CONTRACT_VERSION: '002.1',
  VITE_SUPABASE_CLOUD_URL: 'https://cloud.example.test',
  VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY: 'sb_publishable_cloud',
  VITE_SUPABASE_LAN_URL: 'http://192.168.1.10:8000',
  VITE_SUPABASE_LAN_PUBLISHABLE_KEY: 'sb_publishable_lan',
  VITE_SUPABASE_LOCAL_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY: 'sb_publishable_local',
};

describe('EndpointConfiguration', () => {
  it('ordena cloud, LAN e local com timeout padrão e versão esperada', () => {
    const result = createEndpointConfiguration(base);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value.endpoints.map(({ kind }) => kind)).toEqual(['cloud', 'lan', 'local']);
    expect(result.value).toMatchObject({ probeTimeoutMs: 3000, contractVersion: '002.1' });
  });

  it('aceita LAN configurável e bloqueia par parcial', () => {
    const lanOnly = createEndpointConfiguration({
      VITE_SUPABASE_CONNECTION_MODE: 'lan',
      VITE_SUPABASE_CONTRACT_VERSION: '002.1',
      VITE_SUPABASE_LAN_URL: 'http://10.0.0.8:8000',
      VITE_SUPABASE_LAN_PUBLISHABLE_KEY: 'sb_publishable_lan',
    });
    expect(lanOnly.ok && lanOnly.value.endpoints[0]?.url).toBe('http://10.0.0.8:8000');

    const invalid = createEndpointConfiguration({ ...base, VITE_SUPABASE_LAN_PUBLISHABLE_KEY: undefined });
    expect(invalid).toMatchObject({ ok: false });
  });

  it.each(['service_role.secret', 'sb_secret_server'])('rejeita chave privilegiada %s', (key) => {
    expect(createEndpointConfiguration({ ...base, VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY: key })).toMatchObject({ ok: false });
  });
});
