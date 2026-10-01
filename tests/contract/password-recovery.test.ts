// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createPasswordRecoveryHandler,
  type PasswordRecoveryGateway,
} from '../../supabase/functions/password-recovery/handler';

const request = (email = ' Pessoa@Example.invalid ') => new Request('http://local/password-recovery', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email }),
});

function gateway(overrides: Partial<PasswordRecoveryGateway> = {}): PasswordRecoveryGateway {
  return {
    reserve: vi.fn(async () => true),
    issue: vi.fn(async () => ({ delivery: 'confirmed' as const })),
    audit: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function call(gw: PasswordRecoveryGateway, email?: string) {
  const response = await createPasswordRecoveryHandler(gw)(request(email));
  return { status: response.status, body: await response.json() };
}

describe('password-recovery', () => {
  it('devolve exatamente a mesma resposta pública exista ou não a conta', async () => {
    const existing = await call(gateway({ issue: vi.fn(async () => ({ delivery: 'confirmed' as const })) }));
    const absent = await call(gateway({ issue: vi.fn(async () => ({ delivery: 'not_applicable' as const })) }));

    expect(existing).toEqual(absent);
    expect(existing).toEqual({ status: 202, body: { code: 'RECOVERY_REQUEST_ACCEPTED' } });
  });

  it('normaliza a identidade, revoga links anteriores e emite validade de uma hora', async () => {
    const gw = gateway();
    await call(gw);

    expect(gw.reserve).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/), 60);
    expect(gw.issue).toHaveBeenCalledWith(expect.objectContaining({
      email: 'pessoa@example.invalid',
      identityHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      expiresInSeconds: 3600,
    }));
  });

  it('mantém resposta genérica durante o intervalo mínimo de 60 segundos', async () => {
    const gw = gateway({ reserve: vi.fn(async () => false) });
    const result = await call(gw);

    expect(result).toEqual({ status: 202, body: { code: 'RECOVERY_REQUEST_ACCEPTED' } });
    expect(gw.issue).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/60|segundo|limite/i);
  });

  it.each(['pending', 'failed'] as const)('audita entrega %s sem e-mail, token ou link', async (delivery) => {
    const gw = gateway({ issue: vi.fn(async () => ({ delivery })) });
    await call(gw);

    const serialized = JSON.stringify((gw.audit as ReturnType<typeof vi.fn>).mock.calls);
    expect(serialized).toContain(delivery);
    expect(serialized).not.toContain('pessoa@example.invalid');
    expect(serialized).not.toMatch(/token|password|https?:\/\//i);
  });

  it('rejeita formato inválido sem chamar o provedor', async () => {
    const gw = gateway();
    const result = await call(gw, 'inválido');
    expect(result).toEqual({ status: 400, body: { code: 'INVALID_REQUEST' } });
    expect(gw.issue).not.toHaveBeenCalled();
  });
});
