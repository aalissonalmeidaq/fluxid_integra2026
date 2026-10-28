/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Variáveis públicas que o cliente pode ler. Chaves privilegiadas, do provedor de e-mail e do Storage ficam só no servidor
// (Spec 015, T007; tests/contract/client-secrets.test.ts).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_CONNECTION_MODE?: string;
  readonly VITE_SUPABASE_CLOUD_URL?: string;
  readonly VITE_SUPABASE_CLOUD_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_LAN_URL?: string;
  readonly VITE_SUPABASE_LAN_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_LOCAL_URL?: string;
  readonly VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_PROBE_TIMEOUT_MS?: string;
  readonly VITE_SUPABASE_CONTRACT_VERSION?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_DEMO_ACCESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
