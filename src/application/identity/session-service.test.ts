import { describe, expect, it, vi } from 'vitest';
import { SessionService, type SessionStore, type SessionTransport } from './session-service';

const SESSION = { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer' };

function setup(response: { status: number; body: unknown } | Error = { status: 200, body: { code: 'AUTHENTICATED', session: SESSION } }, token: string | null = 'access') {
  const transport: SessionTransport = {
    call: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  };
  const store: SessionStore = {
    apply: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    accessToken: vi.fn(async () => token),
  };
  return { transport, store, service: new SessionService(transport, store) };
}

describe('SessionService.login', () => {
  it('aplica a sessão aceita e informa autenticação', async () => {
    const { service, store, transport } = setup();
    await expect(service.login({ email: 'a@b.co', password: 'segredo' })).resolves.toEqual({ kind: 'authenticated' });
    expect(store.apply).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' });
    expect(transport.call).toHaveBeenCalledWith('session-login', { email: 'a@b.co', password: 'segredo' });
  });

  it('envia o encerramento explícito somente quando informado', async () => {
    const { service, transport } = setup();
    await service.login({ email: 'a@b.co', password: 'segredo', revokeSessionId: 'sessao-1' });
    expect(transport.call).toHaveBeenCalledWith('session-login', { email: 'a@b.co', password: 'segredo', revoke_session_id: 'sessao-1' });
  });

  it('aplica a sessão AAL1 e sinaliza MFA para perfil global', async () => {
    const { service, store } = setup({ status: 200, body: { code: 'MFA_REQUIRED', session: SESSION } });
    await expect(service.login({ email: 'a@b.co', password: 'x' })).resolves.toEqual({ kind: 'mfa_required' });
    expect(store.apply).toHaveBeenCalledTimes(1);
  });

  it('não aplica sessão no limite e devolve a lista para escolha', async () => {
    const sessions = [{ session_id: 's1', started_at: 't', last_seen_at: 't', aal: 'aal1' }];
    const { service, store } = setup({ status: 409, body: { code: 'SESSION_LIMIT_REACHED', sessions } });
    await expect(service.login({ email: 'a@b.co', password: 'x' })).resolves.toEqual({ kind: 'session_limit', sessions });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'INVALID_CREDENTIALS', 'invalid_credentials'],
    [403, 'ACCOUNT_UNAVAILABLE', 'account_unavailable'],
    [429, 'RATE_LIMITED', 'rate_limited'],
    [400, 'INVALID_REQUEST', 'invalid_request'],
  ] as const)('mapeia %s %s sem aplicar sessão', async (status, code, kind) => {
    const { service, store } = setup({ status, body: { code } });
    await expect(service.login({ email: 'a@b.co', password: 'x' })).resolves.toEqual({ kind });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it.each([
    ['falha de rede', new Error('rede')],
    ['erro interno', { status: 500, body: { code: 'INTERNAL_ERROR' } }],
    ['corpo inesperado', { status: 200, body: { qualquer: 'coisa' } }],
    ['sessão ausente', { status: 200, body: { code: 'AUTHENTICATED' } }],
  ] as const)('trata %s como indisponibilidade sem conceder acesso', async (_label, response) => {
    const { service, store } = setup(response as never);
    await expect(service.login({ email: 'a@b.co', password: 'x' })).resolves.toEqual({ kind: 'unavailable' });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it('nunca repete a senha em resultados', async () => {
    const { service } = setup({ status: 401, body: { code: 'INVALID_CREDENTIALS' } });
    const outcome = await service.login({ email: 'a@b.co', password: 'senha-super-secreta' });
    expect(JSON.stringify(outcome)).not.toContain('senha-super-secreta');
  });
});

describe('SessionService.logout', () => {
  it('revoga a sessão atual no servidor e limpa o cliente', async () => {
    const { service, transport, store } = setup({ status: 200, body: { code: 'SIGNED_OUT' } });
    await service.logout();
    expect(transport.call).toHaveBeenCalledWith('session-logout', undefined, 'access');
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('limpa o cliente mesmo quando o servidor não responde', async () => {
    const { service, store } = setup(new Error('rede'));
    await service.logout();
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('limpa o cliente sem chamar o servidor quando não há token', async () => {
    const { service, transport, store } = setup(undefined, null);
    await service.logout();
    expect(transport.call).not.toHaveBeenCalled();
    expect(store.clear).toHaveBeenCalledTimes(1);
  });
});

describe('SessionService.check', () => {
  it('confirma sessão ativa com nível e validade', async () => {
    const { service, transport } = setup({ status: 200, body: { code: 'SESSION_ACTIVE', aal: 'aal2', expires_at: '2026-09-30T08:00:00Z', mfa_required: false } });
    await expect(service.check()).resolves.toEqual({ kind: 'active', aal: 'aal2', expiresAt: '2026-09-30T08:00:00Z', mfaRequired: false });
    expect(transport.call).toHaveBeenCalledWith('session-status', undefined, 'access');
  });

  it('propaga a exigência de MFA de perfil global restaurado em AAL1', async () => {
    const { service } = setup({ status: 200, body: { code: 'SESSION_ACTIVE', aal: 'aal1', expires_at: 'x', mfa_required: true } });
    await expect(service.check()).resolves.toMatchObject({ kind: 'active', aal: 'aal1', mfaRequired: true });
  });

  it('sem token local reconhece sessão ausente sem chamar o servidor', async () => {
    const { service, transport } = setup(undefined, null);
    await expect(service.check()).resolves.toEqual({ kind: 'missing' });
    expect(transport.call).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'SESSION_EXPIRED', reason: 'inactivity' }, { kind: 'expired', reason: 'inactivity' }],
    [{ code: 'SESSION_EXPIRED', reason: 'timebox' }, { kind: 'expired', reason: 'timebox' }],
    [{ code: 'SESSION_EXPIRED' }, { kind: 'expired' }],
    [{ code: 'SESSION_REVOKED' }, { kind: 'revoked' }],
    [{ code: 'SESSION_INVALID' }, { kind: 'missing' }],
  ] as const)('perde acesso e limpa o cliente para %j', async (body, expected) => {
    const { service, store } = setup({ status: 401, body });
    await expect(service.check()).resolves.toEqual(expected);
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it('indisponibilidade não prolonga nem encerra a sessão: informa inalcançável e mantém o cliente', async () => {
    const { service, store } = setup(new Error('rede'));
    await expect(service.check()).resolves.toEqual({ kind: 'unreachable' });
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('resposta inesperada do servidor é tratada como inalcançável, nunca como ativa', async () => {
    const { service } = setup({ status: 200, body: { code: 'OUTRO' } });
    await expect(service.check()).resolves.toEqual({ kind: 'unreachable' });
  });
});
