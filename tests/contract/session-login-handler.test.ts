// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSessionLoginHandler, type LoginGateway } from '../../supabase/functions/session-login/handler';

const USER = '10000000-0000-0000-0000-000000000004';
const SESSION = '60000000-0000-0000-0000-000000000001';
const REVOKE_ID = '60000000-0000-0000-0000-0000000000aa';
const SESSION_TOKEN = { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, expires_at: 1, token_type: 'bearer' };

function gateway(overrides: Partial<LoginGateway> = {}): LoginGateway {
  return {
    isRateLimited: vi.fn(async () => false),
    registerFailure: vi.fn(async () => undefined),
    clearFailures: vi.fn(async () => undefined),
    signIn: vi.fn(async () => ({ ok: true as const, userId: USER, sessionId: SESSION, aal: 'aal1' as const, session: SESSION_TOKEN })),
    signOutSession: vi.fn(async () => undefined),
    eligibility: vi.fn(async () => ({ eligible: true, requiresMfa: false })),
    endSession: vi.fn(async () => true),
    startSession: vi.fn(async () => ({ status: 'started' as const })),
    audit: vi.fn(async () => undefined),
    ...overrides,
  };
}

const post = (body: unknown) =>
  new Request('http://local/session-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const credentials = { email: ' Sess-Limit@Example.invalid ', password: 'Local-only-004!' };

async function call(gw: LoginGateway, body: unknown = credentials) {
  const response = await createSessionLoginHandler(gw)(post(body));
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe('session-login', () => {
  it('autentica e entrega a sessão aceita', async () => {
    const gw = gateway();
    const { status, body } = await call(gw);
    expect(status).toBe(200);
    expect(body.code).toBe('AUTHENTICATED');
    expect(body.session.access_token).toBe('access');
    expect(gw.clearFailures).toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login', result: 'success' }));
  });

  it('normaliza o e-mail apenas para autenticação', async () => {
    const gw = gateway();
    await call(gw);
    expect(gw.signIn).toHaveBeenCalledWith('sess-limit@example.invalid', 'Local-only-004!');
  });

  it('devolve mensagem genérica para credenciais inválidas e registra a falha sem a senha', async () => {
    const gw = gateway({ signIn: vi.fn(async () => ({ ok: false as const })) });
    const { status, body } = await call(gw);
    expect(status).toBe(401);
    expect(body).toEqual({ code: 'INVALID_CREDENTIALS' });
    expect(gw.registerFailure).toHaveBeenCalledTimes(1);
    const audited = JSON.stringify((gw.audit as ReturnType<typeof vi.fn>).mock.calls);
    expect(audited).not.toContain('Local-only-004!');
    expect(audited).toContain('auth.login.failed');
  });

  it('usa somente hash da identidade como chave do limitador', async () => {
    const gw = gateway({ signIn: vi.fn(async () => ({ ok: false as const })) });
    await call(gw);
    const key = (gw.registerFailure as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('sess-limit');
  });

  it('bloqueia com RATE_LIMITED sem tentar autenticar', async () => {
    const gw = gateway({ isRateLimited: vi.fn(async () => true) });
    const { status, body } = await call(gw);
    expect(status).toBe(429);
    expect(body).toEqual({ code: 'RATE_LIMITED' });
    expect(gw.signIn).not.toHaveBeenCalled();
  });

  it('nega conta sem vínculo elegível, encerra a sessão Auth criada e audita', async () => {
    const gw = gateway({ eligibility: vi.fn(async () => ({ eligible: false, requiresMfa: false })) });
    const { status, body } = await call(gw);
    expect(status).toBe(403);
    expect(body).toEqual({ code: 'ACCOUNT_UNAVAILABLE' });
    expect(gw.signOutSession).toHaveBeenCalledWith('access');
    expect(gw.startSession).not.toHaveBeenCalled();
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.login', result: 'denied' }));
  });

  it('não entrega a quarta sessão e devolve a lista para encerramento explícito', async () => {
    const sessions = [{ session_id: 'a', started_at: 't', last_seen_at: 't', aal: 'aal1' }];
    const gw = gateway({ startSession: vi.fn(async () => ({ status: 'limit_reached' as const, sessions })) });
    const { status, body } = await call(gw);
    expect(status).toBe(409);
    expect(body).toEqual({ code: 'SESSION_LIMIT_REACHED', sessions });
    expect(gw.signOutSession).toHaveBeenCalledWith('access');
    expect(JSON.stringify(body)).not.toMatch(/token/i);
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.session.limit_reached' }));
  });

  it('encerra a sessão escolhida antes de registrar a nova', async () => {
    const gw = gateway();
    const { status, body } = await call(gw, { ...credentials, revoke_session_id: REVOKE_ID });
    expect(status).toBe(200);
    expect(body.code).toBe('AUTHENTICATED');
    expect(gw.endSession).toHaveBeenCalledWith(USER, REVOKE_ID, 'user_revoked');
    expect(gw.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.session.revoke' }));
  });

  it('rejeita revoke_session_id que não seja UUID sem encerrar nada', async () => {
    const gw = gateway();
    const { status } = await call(gw, { ...credentials, revoke_session_id: 'nao-e-uuid' });
    expect(status).toBe(400);
    expect(gw.endSession).not.toHaveBeenCalled();
    expect(gw.signIn).not.toHaveBeenCalled();
  });

  it('não permite encerrar sessão que não pertence ao usuário autenticado', async () => {
    const gw = gateway({
      endSession: vi.fn(async () => false),
      startSession: vi.fn(async () => ({ status: 'limit_reached' as const, sessions: [] })),
    });
    const { status, body } = await call(gw, { ...credentials, revoke_session_id: REVOKE_ID });
    expect(status).toBe(409);
    expect(body.code).toBe('SESSION_LIMIT_REACHED');
  });

  it('exige MFA para perfil global entregando a sessão AAL1 limitada', async () => {
    const gw = gateway({ eligibility: vi.fn(async () => ({ eligible: true, requiresMfa: true })) });
    const { status, body } = await call(gw);
    expect(status).toBe(200);
    expect(body.code).toBe('MFA_REQUIRED');
    expect(body.session.access_token).toBe('access');
  });

  it.each([{}, { email: 'a@b.c' }, { password: 'x' }, { email: 42, password: 'x' }, { email: 'sem-arroba', password: 'x' }, null])(
    'rejeita entrada inválida %j sem tocar no Auth',
    async (body) => {
      const gw = gateway();
      const { status, body: response } = await call(gw, body);
      expect(status).toBe(400);
      expect(response).toEqual({ code: 'INVALID_REQUEST' });
      expect(gw.signIn).not.toHaveBeenCalled();
    },
  );

  it('aceita somente POST e responde ao preflight CORS', async () => {
    const handler = createSessionLoginHandler(gateway());
    expect((await handler(new Request('http://local/x', { method: 'GET' }))).status).toBe(405);
    const preflight = await handler(new Request('http://local/x', { method: 'OPTIONS' }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/authorization/i);
  });

  it('não expõe detalhes internos nem segredos em falhas inesperadas', async () => {
    const gw = gateway({ signIn: vi.fn(async () => { throw new Error('postgres://user:secret@host'); }) });
    const { status, body } = await call(gw);
    expect(status).toBe(500);
    expect(body).toEqual({ code: 'INTERNAL_ERROR' });
  });

  it('nunca guarda cache das respostas de autenticação', async () => {
    const { headers } = await call(gateway());
    expect(headers.get('cache-control')).toBe('no-store');
  });
});
