// @vitest-environment node
import { describe, expect, it } from 'vitest';

const URL = 'http://127.0.0.1:54321/functions/v1/password-recovery';
const KEY = import.meta.env.VITE_SUPABASE_LOCAL_PUBLISHABLE_KEY as string | undefined;

async function request(email: string) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: KEY ?? '' },
    body: JSON.stringify({ email }),
  });
  return { status: response.status, body: await response.json() };
}

describe.skipIf(!KEY)('password-recovery live', () => {
  it('mantém resposta equivalente para identidade existente e ausente no Auth real', async () => {
    const existing = await request('admin-a@fluxid.local');
    const absent = await request(`ausente-${crypto.randomUUID()}@example.invalid`);

    expect(existing).toEqual(absent);
    expect(existing).toEqual({ status: 202, body: { code: 'RECOVERY_REQUEST_ACCEPTED' } });
    expect(JSON.stringify(existing)).not.toMatch(/admin-a|ausente|token|link|60/i);
  });
});
