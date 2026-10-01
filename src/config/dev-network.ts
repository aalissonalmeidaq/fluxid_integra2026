// Em desenvolvimento, o app pode ser aberto de outro aparelho da mesma rede (por exemplo, um celular que acessa o
// endereço de rede da máquina de desenvolvimento). Nesse caso o endereço de loopback do Supabase local aponta para o
// próprio celular e a conexão falha. Em vez de abrir o Supabase CLI para a rede, o servidor de desenvolvimento do Vite
// repassa as chamadas (vite.config.ts, server.proxy) e esta função aponta o destino "local" para ele, pela mesma origem
// da página. Nunca age fora do desenvolvimento, e a chave publicável não muda.
export interface DeviceContext {
  // Origem da página (window.location.origin), com protocolo, host e porta.
  pageOrigin: string;
  // Verdadeiro só no servidor de desenvolvimento do Vite (import.meta.env.DEV).
  isDevelopment: boolean;
}

// Prefixo que o Vite repassa ao Supabase local; vite.config.ts usa o mesmo valor.
export const LOCAL_SUPABASE_PROXY_PATH = '/supabase-local';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function adaptLocalEndpointToDevice(
  env: Record<string, string | undefined>,
  { pageOrigin, isDevelopment }: DeviceContext,
): Record<string, string | undefined> {
  if (!isDevelopment) return env;

  let page: URL;
  try {
    page = new URL(pageOrigin);
  } catch {
    return env;
  }
  if (!/^https?:$/.test(page.protocol) || LOOPBACK.has(page.hostname)) return env;

  const raw = env.VITE_SUPABASE_LOCAL_URL?.trim();
  if (!raw) return env;

  let local: URL;
  try {
    local = new URL(raw);
  } catch {
    return env;
  }
  if (!LOOPBACK.has(local.hostname)) return env;

  return { ...env, VITE_SUPABASE_LOCAL_URL: `${page.origin}${LOCAL_SUPABASE_PROXY_PATH}` };
}
