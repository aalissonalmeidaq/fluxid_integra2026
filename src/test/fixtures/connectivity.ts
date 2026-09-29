export const MOCK_URLS = {
  local: 'http://127.0.0.1:54321',
  lan: 'https://lan.fluxid.local:8443',
  cloud: 'https://app-project.supabase.co',
} as const;

export const MOCK_KEYS = {
  local: 'sb_publishable_mock_local_key_1234567890',
  lan: 'sb_publishable_mock_lan_key_1234567890',
  cloud: 'sb_publishable_mock_cloud_key_1234567890',
} as const;

export function createHealthResponse(status: number): Response {
  return new Response(status === 200 ? JSON.stringify({ version: '1.0.0' }) : 'Error', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function createNetworkError(): Error {
  const err = new TypeError('Failed to fetch');
  err.name = 'TypeError';
  return err;
}

export function createTimeoutError(): Error {
  const err = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  return err;
}
