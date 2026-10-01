// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSessionLogoutHandler, type LogoutGateway } from '../../supabase/functions/session-logout/handler';
import { createSessionStatusHandler, type StatusGateway } from '../../supabase/functions/session-status/handler';

const USER = '10000000-0000-0000-0000-000000000004';
const SESSION = '60000000-0000-0000-0000-000000000001';

const request = (token?: string, method = 'POST') =>
  new Request('http://local/fn', { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('session-logout', () => {
  const gateway = (overrides: Partial<LogoutGateway> = {}): LogoutGateway => ({
    authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION })),
    endSession: vi.fn(async () => true),
    audit: vi.fn(async () => undefined),
    ...overrides,
  });

  it('revoga somente a sessão atual e audita', async () => {
    const gw = gateway();
    const response = await createSessionLogoutHandler(gw)(request('jwt'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 'SIGNED_OUT' });
    expect(gw.endSession).toHaveBeenCalledTimes(1);
    expect(gw.endSession).toHaveBeenCalledWith(USER, SESSION, 'user_logout');
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.logout', result: 'success' }));
  });

  it('responde SIGNED_OUT mesmo com token ausente ou inválido, sem revogar nada', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => null) });
    for (const token of [undefined, 'invalido']) {
      const response = await createSessionLogoutHandler(gw)(request(token));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ code: 'SIGNED_OUT' });
    }
    expect(gw.endSession).not.toHaveBeenCalled();
  });

  it('responde SIGNED_OUT quando a sessão já estava encerrada', async () => {
    const gw = gateway({ endSession: vi.fn(async () => false) });
    const response = await createSessionLogoutHandler(gw)(request('jwt'));
    expect(await response.json()).toEqual({ code: 'SIGNED_OUT' });
  });

  it('não expõe detalhes internos em falha inesperada, mas nunca simula sucesso oculto', async () => {
    const gw = gateway({ endSession: vi.fn(async () => { throw new Error('detalhe interno'); }) });
    const response = await createSessionLogoutHandler(gw)(request('jwt'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' });
  });

  it('trata preflight e rejeita outros métodos', async () => {
    const handler = createSessionLogoutHandler(gateway());
    expect((await handler(request(undefined, 'OPTIONS'))).status).toBe(204);
    expect((await handler(request('jwt', 'GET'))).status).toBe(405);
  });
});

describe('session-status', () => {
  const gateway = (overrides: Partial<StatusGateway> = {}): StatusGateway => ({
    authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal1' as const })),
    validate: vi.fn(async () => ({ status: 'active' as const, aal: 'aal1' as const, expires_at: '2026-09-30T08:00:00Z' })),
    upgradeAal: vi.fn(async () => undefined),
    requiresMfa: vi.fn(async () => false),
    audit: vi.fn(async () => undefined),
    ...overrides,
  });

  it('confirma sessão ativa e registra atividade pelo gateway confiável', async () => {
    const gw = gateway();
    const response = await createSessionStatusHandler(gw)(request('jwt'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 'SESSION_ACTIVE', aal: 'aal1', expires_at: '2026-09-30T08:00:00Z', mfa_required: false });
    expect(gw.validate).toHaveBeenCalledWith(USER, SESSION);
  });

  it('eleva o AAL registrado quando o token comprova aal2', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal2' as const })) });
    const response = await createSessionStatusHandler(gw)(request('jwt'));
    expect((await response.json()).aal).toBe('aal2');
    expect(gw.upgradeAal).toHaveBeenCalledWith(USER, SESSION);
  });

  it('informa mfa_required para perfil global ainda em AAL1', async () => {
    const gw = gateway({ requiresMfa: vi.fn(async () => true) });
    const body = await (await createSessionStatusHandler(gw)(request('jwt'))).json();
    expect(body.mfa_required).toBe(true);
    expect(gw.requiresMfa).toHaveBeenCalledWith(USER);
  });

  it('não exige MFA de novo quando a sessão já está em AAL2', async () => {
    const gw = gateway({
      authenticate: vi.fn(async () => ({ userId: USER, sessionId: SESSION, aal: 'aal2' as const })),
      requiresMfa: vi.fn(async () => true),
    });
    const body = await (await createSessionStatusHandler(gw)(request('jwt'))).json();
    expect(body.mfa_required).toBe(false);
  });

  it('não eleva o AAL quando o token é aal1', async () => {
    const gw = gateway();
    await createSessionStatusHandler(gw)(request('jwt'));
    expect(gw.upgradeAal).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', 'inactivity', 'SESSION_EXPIRED'],
    ['expired', 'timebox', 'SESSION_EXPIRED'],
    ['revoked', undefined, 'SESSION_REVOKED'],
    ['missing', undefined, 'SESSION_INVALID'],
  ] as const)('nega acesso protegido para sessão %s (%s)', async (status, reason, code) => {
    const gw = gateway({ validate: vi.fn(async () => ({ status, ...(reason ? { reason } : {}) })) });
    const response = await createSessionStatusHandler(gw)(request('jwt'));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe(code);
  });

  it('audita a expiração com motivo sanitizado', async () => {
    const gw = gateway({ validate: vi.fn(async () => ({ status: 'expired' as const, reason: 'inactivity' })) });
    await createSessionStatusHandler(gw)(request('jwt'));
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.session.expire', reason: 'inactivity' }));
  });

  it('nega token ausente ou inválido como SESSION_INVALID', async () => {
    const gw = gateway({ authenticate: vi.fn(async () => null) });
    for (const token of [undefined, 'invalido']) {
      const response = await createSessionStatusHandler(gw)(request(token));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: 'SESSION_INVALID' });
    }
    expect(gw.validate).not.toHaveBeenCalled();
  });

  it('não guarda cache e trata preflight', async () => {
    const handler = createSessionStatusHandler(gateway());
    expect((await handler(request('jwt'))).headers.get('cache-control')).toBe('no-store');
    expect((await handler(request(undefined, 'OPTIONS'))).status).toBe(204);
    expect((await handler(request('jwt', 'GET'))).status).toBe(405);
  });
});
