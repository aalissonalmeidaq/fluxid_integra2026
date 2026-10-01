import { json, preflight, sha256Hex } from '../_shared/http.ts';

export type RecoveryDelivery = 'confirmed' | 'pending' | 'failed' | 'not_applicable';

export interface PasswordRecoveryGateway {
  reserve(identityHash: string, minimumIntervalSeconds: number): Promise<boolean>;
  issue(input: { email: string; identityHash: string; expiresInSeconds: number }): Promise<{ delivery: RecoveryDelivery }>;
  audit(event: { action: 'auth.recovery.request'; result: RecoveryDelivery | 'rate_limited'; identityHash: string }): Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_ACCEPTED = { code: 'RECOVERY_REQUEST_ACCEPTED' } as const;

function parse(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const email = (value as Record<string, unknown>).email;
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized) && normalized.length <= 254 ? normalized : null;
}

export function createPasswordRecoveryHandler(gateway: PasswordRecoveryGateway) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);

    try {
      const email = parse(await request.json().catch(() => null));
      if (!email) return json({ code: 'INVALID_REQUEST' }, 400);

      const identityHash = await sha256Hex(`recovery:${email}`);
      if (!(await gateway.reserve(identityHash, 60))) {
        await gateway.audit({ action: 'auth.recovery.request', result: 'rate_limited', identityHash });
        return json(PUBLIC_ACCEPTED, 202);
      }
      const { delivery } = await gateway.issue({ email, identityHash, expiresInSeconds: 3600 });
      await gateway.audit({ action: 'auth.recovery.request', result: delivery, identityHash });
      return json(PUBLIC_ACCEPTED, 202);
    } catch {
      // A fronteira pública não revela existência da conta nem detalhes do provedor de e-mail.
      return json(PUBLIC_ACCEPTED, 202);
    }
  };
}
