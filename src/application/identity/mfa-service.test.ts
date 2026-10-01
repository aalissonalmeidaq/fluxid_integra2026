import { describe, expect, it, vi } from 'vitest';
import { MfaService, type MfaClient } from './mfa-service';

function client(overrides: Partial<MfaClient> = {}): MfaClient {
  return {
    listFactors: vi.fn(async () => ({ data: { totp: [] }, error: null })),
    enroll: vi.fn(async () => ({
      data: { id: 'factor-1', totp: { qr_code: 'data:image/svg+xml;utf8,<svg/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } },
      error: null,
    })),
    challenge: vi.fn(async () => ({ data: { id: 'challenge-1' }, error: null })),
    verify: vi.fn(async () => ({ data: {}, error: null })),
    unenroll: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe('MfaService.begin', () => {
  it('matricula um fator novo quando não há TOTP verificado, com QR e alternativa textual', async () => {
    const mfa = new MfaService(client());
    await expect(mfa.begin()).resolves.toEqual({
      kind: 'enroll', factorId: 'factor-1', qrCode: 'data:image/svg+xml;utf8,<svg/>', secret: 'JBSWY3DPEHPK3PXP',
    });
  });

  it('usa o fator TOTP já verificado e apenas pede o código', async () => {
    const c = client({ listFactors: vi.fn(async () => ({ data: { totp: [{ id: 'factor-9', status: 'verified' }] }, error: null })) });
    await expect(new MfaService(c).begin()).resolves.toEqual({ kind: 'challenge', factorId: 'factor-9' });
    expect(c.enroll).not.toHaveBeenCalled();
  });

  it('descarta fator não verificado deixado por matrícula abandonada antes de criar outro', async () => {
    const c = client({ listFactors: vi.fn(async () => ({ data: { totp: [{ id: 'velho', status: 'unverified' }] }, error: null })) });
    await new MfaService(c).begin();
    expect(c.unenroll).toHaveBeenCalledWith({ factorId: 'velho' });
    expect(c.enroll).toHaveBeenCalledTimes(1);
  });

  // O Auth devolve em totp só os fatores verificados; os abandonados vêm apenas em all.
  it('descarta o fator abandonado que o Auth lista só em all, não em totp', async () => {
    const c = client({
      listFactors: vi.fn(async () => ({
        data: { totp: [], all: [{ id: 'abandonado', status: 'unverified', factor_type: 'totp' }, { id: 'outro-tipo', status: 'unverified', factor_type: 'phone' }] },
        error: null,
      })),
    });
    await new MfaService(c).begin();
    expect(c.unenroll).toHaveBeenCalledTimes(1);
    expect(c.unenroll).toHaveBeenCalledWith({ factorId: 'abandonado' });
  });

  it('matricula com nome amigável único, para um fator esquecido nunca bloquear a matrícula (mfa_factor_name_conflict)', async () => {
    const c = client();
    await new MfaService(c).begin();
    await new MfaService(c).begin();
    const nomes = (c.enroll as ReturnType<typeof vi.fn>).mock.calls.map(([params]) => (params as { friendlyName?: string } | undefined)?.friendlyName);
    expect(nomes).toHaveLength(2);
    expect(nomes[0]).toMatch(/^FluxID /);
    expect(nomes[0]).not.toBe(nomes[1]);
  });

  it('informa indisponibilidade quando o Auth falha', async () => {
    const c = client({ listFactors: vi.fn(async () => ({ data: null, error: { message: 'x' } })) });
    await expect(new MfaService(c).begin()).resolves.toEqual({ kind: 'unavailable' });
  });
});

describe('MfaService.verify', () => {
  it('desafia e verifica o código informado', async () => {
    const c = client();
    await expect(new MfaService(c).verify('factor-1', '123456')).resolves.toBe('verified');
    expect(c.challenge).toHaveBeenCalledWith({ factorId: 'factor-1' });
    expect(c.verify).toHaveBeenCalledWith({ factorId: 'factor-1', challengeId: 'challenge-1', code: '123456' });
  });

  it('normaliza espaços do código colado', async () => {
    const c = client();
    await new MfaService(c).verify('factor-1', ' 123 456 ');
    expect(c.verify).toHaveBeenCalledWith(expect.objectContaining({ code: '123456' }));
  });

  it.each(['12345', '1234567', 'abcdef', ''])('rejeita o formato %j sem chamar o Auth', async (code) => {
    const c = client();
    await expect(new MfaService(c).verify('factor-1', code)).resolves.toBe('invalid_code');
    expect(c.challenge).not.toHaveBeenCalled();
  });

  it('não revela detalhes quando o código está incorreto', async () => {
    const c = client({ verify: vi.fn(async () => ({ data: null, error: { message: 'Invalid TOTP code entered' } })) });
    await expect(new MfaService(c).verify('factor-1', '123456')).resolves.toBe('invalid_code');
  });

  it('informa indisponibilidade quando o desafio falha', async () => {
    const c = client({ challenge: vi.fn(async () => ({ data: null, error: { message: 'x' } })) });
    await expect(new MfaService(c).verify('factor-1', '123456')).resolves.toBe('unavailable');
  });

  it('informa indisponibilidade quando o Auth lança exceção', async () => {
    const c = client({ challenge: vi.fn(async () => { throw new Error('rede'); }) });
    await expect(new MfaService(c).verify('factor-1', '123456')).resolves.toBe('unavailable');
  });
});
