export interface PasswordRecoveryTransport {
  request(email: string): Promise<{ status: number; code?: string }>;
  updatePassword(password: string): Promise<{ ok: boolean }>;
}

export type RecoveryRequestOutcome = 'accepted' | 'invalid' | 'unavailable';
export type RecoveryCompletionOutcome = 'completed' | 'invalid_or_expired' | 'invalid_password' | 'unavailable';

export class PasswordRecoveryService {
  constructor(private readonly transport: PasswordRecoveryTransport) {}

  async request(email: string): Promise<RecoveryRequestOutcome> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) return 'invalid';
    try {
      const response = await this.transport.request(email.trim().toLowerCase());
      return response.status === 202 && response.code === 'RECOVERY_REQUEST_ACCEPTED' ? 'accepted' : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  async complete(password: string, confirmation: string): Promise<RecoveryCompletionOutcome> {
    if (password !== confirmation || password.length < 12) return 'invalid_password';
    try {
      return (await this.transport.updatePassword(password)).ok ? 'completed' : 'invalid_or_expired';
    } catch {
      return 'unavailable';
    }
  }
}
