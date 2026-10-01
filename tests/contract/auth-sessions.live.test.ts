// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { callFunction, endAllSessions, login, logout, sessionStatus, USERS } from '../support/auth-harness';

// Contrato ao vivo de session-login, session-logout e session-status (T060).
// Exige o Supabase local em execução com o seed determinístico.
describe('Contrato de autenticação e sessões (RF-001–RF-004, RS-009, RS-010)', () => {
  // Usuários compartilhados com outras execuções: parte e termina sem sessões residuais.
  beforeAll(async () => { await endAllSessions(USERS.contract); await endAllSessions(USERS.master); });
  afterAll(async () => { await endAllSessions(USERS.contract); await endAllSessions(USERS.master); });

  it('autentica usuário elegível e entrega a sessão aceita, depois encerra', async () => {
    const result = await login(USERS.contract);
    expect(result.status).toBe(200);
    expect(result.body.code).toBe('AUTHENTICATED');
    expect(result.body.session.access_token).toBeTruthy();

    const active = await sessionStatus(result.body.session.access_token);
    expect(active.status).toBe(200);
    expect(active.body.code).toBe('SESSION_ACTIVE');

    expect((await logout(result.body.session.access_token)).body).toEqual({ code: 'SIGNED_OUT' });
  });

  it('não revela qual parte da credencial está incorreta', async () => {
    const wrongPassword = await login({ email: USERS.contract.email, password: 'senha-incorreta-123' });
    const unknownEmail = await login({ email: `inexistente-${crypto.randomUUID()}@example.invalid`, password: 'senha-incorreta-123' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual({ code: 'INVALID_CREDENTIALS' });
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('nega conta sem vínculo elegível sem revelar tenant e sem deixar sessão ativa', async () => {
    const result = await login(USERS.unavailable);
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ code: 'ACCOUNT_UNAVAILABLE' });
  });

  it('exige MFA de perfil global entregando a sessão AAL1 limitada', async () => {
    const result = await login(USERS.master);
    expect(result.body.code).toBe('MFA_REQUIRED');
    expect(result.body.session.access_token).toBeTruthy();
    await logout(result.body.session.access_token);
  });

  it('aplica limite contra abuso com resposta genérica e sem confirmar a conta', async () => {
    const email = `abuso-${crypto.randomUUID()}@example.invalid`;
    const codes: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      codes.push((await login({ email, password: 'senha-incorreta-123' })).status);
    }
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
    const limited = await login({ email, password: 'senha-incorreta-123' });
    expect(limited.body).toEqual({ code: 'RATE_LIMITED' });
  });

  it('rejeita entrada malformada sem consultar o Auth', async () => {
    for (const body of [{}, { email: 'sem-arroba', password: 'x' }, { email: 'a@b.co' }]) {
      const result = await callFunction('session-login', body);
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ code: 'INVALID_REQUEST' });
    }
  });

  it('logout é idempotente e a sessão encerrada perde acesso protegido', async () => {
    const result = await login(USERS.contract);
    const token = result.body.session.access_token;
    await logout(token);
    expect((await logout(token)).body).toEqual({ code: 'SIGNED_OUT' });
    const status = await sessionStatus(token);
    expect(status.status).toBe(401);
    expect(['SESSION_INVALID', 'SESSION_REVOKED']).toContain(status.body.code);
  });

  it('logout sem token responde SIGNED_OUT sem revelar nada', async () => {
    expect((await logout()).body).toEqual({ code: 'SIGNED_OUT' });
    expect((await logout('token-invalido')).body).toEqual({ code: 'SIGNED_OUT' });
  });

  it('não expõe tokens, senha ou detalhes internos em respostas de erro', async () => {
    const result = await login({ email: USERS.contract.email, password: 'senha-incorreta-123' });
    expect(JSON.stringify(result.body)).not.toMatch(/token|senha-incorreta|stack|postgres/i);
    expect(result.headers.get('cache-control')).toBe('no-store');
  });
});
