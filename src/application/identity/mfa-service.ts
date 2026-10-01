interface AuthResult<T> { data: T | null; error: { message: string } | null }

export interface MfaClient {
  listFactors(): Promise<AuthResult<{ totp: Array<{ id: string; status: string }> }>>;
  enroll(): Promise<AuthResult<{ id: string; totp: { qr_code: string; secret: string; uri: string } }>>;
  challenge(params: { factorId: string }): Promise<AuthResult<{ id: string }>>;
  verify(params: { factorId: string; challengeId: string; code: string }): Promise<AuthResult<unknown>>;
  unenroll(params: { factorId: string }): Promise<{ error: { message: string } | null }>;
}

export type MfaBegin =
  | { kind: 'enroll'; factorId: string; qrCode: string; secret: string }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'unavailable' };

export type MfaVerification = 'verified' | 'invalid_code' | 'unavailable';

const CODE_PATTERN = /^\d{6}$/;

// Matrícula e verificação TOTP. A elevação a AAL2 só vale depois da confirmação da fronteira confiável.
export class MfaService {
  constructor(private readonly client: MfaClient) {}

  async begin(): Promise<MfaBegin> {
    try {
      const factors = await this.client.listFactors();
      if (factors.error || !factors.data) return { kind: 'unavailable' };

      const verified = factors.data.totp.find((factor) => factor.status === 'verified');
      if (verified) return { kind: 'challenge', factorId: verified.id };

      // Matrícula abandonada deixa fator não verificado; remove antes de criar outro para não acumular.
      for (const stale of factors.data.totp.filter((factor) => factor.status !== 'verified')) {
        await this.client.unenroll({ factorId: stale.id });
      }

      const enrolled = await this.client.enroll();
      if (enrolled.error || !enrolled.data) return { kind: 'unavailable' };
      return { kind: 'enroll', factorId: enrolled.data.id, qrCode: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret };
    } catch {
      return { kind: 'unavailable' };
    }
  }

  async verify(factorId: string, rawCode: string): Promise<MfaVerification> {
    const code = rawCode.replace(/\s+/g, '');
    if (!CODE_PATTERN.test(code)) return 'invalid_code';
    try {
      const challenge = await this.client.challenge({ factorId });
      if (challenge.error || !challenge.data) return 'unavailable';
      const verified = await this.client.verify({ factorId, challengeId: challenge.data.id, code });
      return verified.error ? 'invalid_code' : 'verified';
    } catch {
      return 'unavailable';
    }
  }
}
