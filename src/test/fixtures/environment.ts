import { MOCK_URLS, MOCK_KEYS } from './connectivity';

export function createValidEnv(mode: 'auto' | 'local' | 'lan' | 'cloud' = 'auto'): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    VITE_SUPABASE_CONNECTION_MODE: mode,
    VITE_SUPABASE_PROBE_TIMEOUT_MS: '3000',
    VITE_SUPABASE_CONTRACT_VERSION: '002.1',
  };

  if (mode === 'local' || mode === 'auto') {
    env.VITE_SUPABASE_LOCAL_URL = MOCK_URLS.local;
    env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY = MOCK_KEYS.local;
  }

  if (mode === 'lan' || mode === 'auto') {
    env.VITE_SUPABASE_LAN_URL = MOCK_URLS.lan;
    env.VITE_SUPABASE_LAN_PUBLISHABLE_KEY = MOCK_KEYS.lan;
  }

  if (mode === 'cloud' || mode === 'auto') {
    env.VITE_SUPABASE_CLOUD_URL = MOCK_URLS.cloud;
    env.VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY = MOCK_KEYS.cloud;
  }

  return env;
}

export function createIncompleteEnv(mode: 'local' | 'lan' | 'cloud'): Record<string, string | undefined> {
  const env = createValidEnv(mode);
  if (mode === 'local') delete env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY;
  if (mode === 'lan') delete env.VITE_SUPABASE_LAN_URL;
  if (mode === 'cloud') delete env.VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY;
  return env;
}
