// Utilitários das suítes de contrato e integração que falam com o Supabase local.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY ?? '';

export interface Credentials { email: string; password: string }

// Usuários sintéticos do seed local; nunca usados fora do ambiente de desenvolvimento.
export const USERS = {
  master: { email: 'master@example.invalid', password: 'Local-only-001!' },
  limit: { email: 'sess-limit@example.invalid', password: 'Local-only-004!' },
  life: { email: 'sess-life@example.invalid', password: 'Local-only-005!' },
  mfaGlobal: { email: 'mfa-global@example.invalid', password: 'Local-only-006!' },
  unavailable: { email: 'unavailable@example.invalid', password: 'Local-only-007!' },
  contract: { email: 'contract@example.invalid', password: 'Local-only-008!' },
  other: { email: 'other@example.invalid', password: 'Local-only-009!' },
  avatarA: { email: 'avatar-a@example.invalid', password: 'Local-only-010!' },
  avatarB: { email: 'avatar-b@example.invalid', password: 'Local-only-011!' },
  // Administrador do Tenant A (seed): papel oficial com audit.read.
  tenantAAdmin: { email: 'admin-a@example.invalid', password: 'Local-only-002!' },
  // Membro do Tenant B sem papéis, dedicado à suíte de auditoria (não compartilhado com outras suítes).
  auditB: { email: 'audit-b@example.invalid', password: 'Local-only-012!' },
  // Administrador do Tenant B (seed), usado como ator de outro tenant.
  tenantBAdmin: { email: 'admin-b@example.invalid', password: 'Local-only-003!' },
  // Membro do Tenant B sem papéis, dedicado à medição de desempenho (suíte performance.live).
  perf: { email: 'perf@example.invalid', password: 'Local-only-013!' },
  // Spec 004 (suíte de permissões do menu): administrador do Tenant C e operador técnico no Tenant D; operador técnico no C;
  // Administrador FluxID na organização proprietária. Cada suíte tem usuário próprio porque as sessões são limitadas por usuário.
  navAdmin: { email: 'nav-admin@example.invalid', password: 'Local-only-014!' },
  navOperator: { email: 'nav-operator@example.invalid', password: 'Local-only-015!' },
  navFluxid: { email: 'nav-fluxid@example.invalid', password: 'Local-only-016!' },
} as const;

export interface FunctionResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
}

export async function callFunction(name: string, body?: unknown, accessToken?: string): Promise<FunctionResponse> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

export const login = (credentials: Credentials & { revoke_session_id?: string }) => callFunction('session-login', credentials);
export const logout = (accessToken?: string) => callFunction('session-logout', undefined, accessToken);
export const sessionStatus = (accessToken?: string) => callFunction('session-status', undefined, accessToken);

export interface ActiveSession { session_id: string; started_at: string; last_seen_at: string; aal: string }

// Deixa o usuário sem sessões ativas usando apenas as próprias credenciais: preenche o limite para
// aprender os identificadores e depois encerra cada sessão explicitamente, descartando a nova de cada troca.
export async function endAllSessions(credentials: Credentials): Promise<void> {
  let sessions: ActiveSession[] = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await login(credentials);
    if (result.status === 409) {
      sessions = result.body.sessions as ActiveSession[];
      break;
    }
    if (result.status !== 200) return;
  }
  for (const session of sessions) {
    const swapped = await login({ ...credentials, revoke_session_id: session.session_id });
    if (swapped.status === 200) await logout(swapped.body.session.access_token);
  }
}

export async function restGet(path: string, accessToken: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, body: await response.json() };
}

export const supabaseUrl = SUPABASE_URL;
export const publishableKey = PUBLISHABLE_KEY;
