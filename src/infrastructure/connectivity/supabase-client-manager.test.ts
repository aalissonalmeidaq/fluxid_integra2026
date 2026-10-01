import { describe, expect, it, vi } from 'vitest';
import { SupabaseClientManager } from './supabase-client-manager';

describe('SupabaseClientManager', () => {
  it('mantém exatamente um cliente e invalida o anterior na troca', async () => {
    const first = { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } };
    const second = { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } };
    const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const manager = new SupabaseClientManager(factory);

    await manager.activate({ kind: 'cloud', url: 'https://cloud.test', publishableKey: 'public' });
    await manager.activate({ kind: 'lan', url: 'http://lan.test', publishableKey: 'public' });

    expect(first.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(manager.current()).toBe(second);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('exige autenticação independente no destino e nunca recebe credenciais reutilizáveis', async () => {
    const authenticateAtDestination = vi.fn().mockResolvedValue({ userId: 'user-1' });
    const manager = new SupabaseClientManager(() => ({ auth: { signOut: vi.fn() } }));
    const result = await manager.activate(
      { kind: 'local', url: 'http://local.test', publishableKey: 'public' },
      { authenticateAtDestination },
    );

    expect(result.requiresReauthentication).toBe(true);
    expect(authenticateAtDestination).toHaveBeenCalledWith({ endpoint: 'local' });
    expect(JSON.stringify(authenticateAtDestination.mock.calls)).not.toMatch(/refresh.?token|password|mfa.?secret/i);
  });
});
