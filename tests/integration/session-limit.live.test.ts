// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { endAllSessions, login, logout, sessionStatus, USERS, type ActiveSession } from '../support/auth-harness';

// Limite de três sessões simultâneas (RF-036, RF-037), com o Supabase local e concorrência real.
describe('Limite de sessões simultâneas', () => {
  const tokens: string[] = [];

  async function open(credentials = USERS.limit) {
    const result = await login(credentials);
    if (result.status === 200) tokens.push(result.body.session.access_token);
    return result;
  }

  beforeEach(async () => {
    await endAllSessions(USERS.limit);
    await endAllSessions(USERS.other);
  });

  afterEach(async () => {
    tokens.length = 0;
    await endAllSessions(USERS.limit);
    await endAllSessions(USERS.other);
  });

  it('aceita três sessões, não entrega a quarta e lista as ativas sem segredos', async () => {
    for (let index = 0; index < 3; index += 1) expect((await open()).status).toBe(200);

    const fourth = await open();
    expect(fourth.status).toBe(409);
    expect(fourth.body.code).toBe('SESSION_LIMIT_REACHED');
    expect(fourth.body.sessions).toHaveLength(3);
    expect(fourth.body.session).toBeUndefined();
    expect(JSON.stringify(fourth.body)).not.toMatch(/token|password|refresh/i);
    for (const session of fourth.body.sessions as ActiveSession[]) {
      expect(Object.keys(session).sort()).toEqual(['aal', 'last_seen_at', 'session_id', 'started_at']);
    }
  });

  it('não revoga nenhuma sessão automaticamente ao atingir o limite', async () => {
    for (let index = 0; index < 3; index += 1) await open();
    await open();
    for (const token of tokens) {
      expect((await sessionStatus(token)).body.code).toBe('SESSION_ACTIVE');
    }
  });

  it('respeita o limite sob concorrência real', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => login(USERS.limit)));
    for (const result of results) if (result.status === 200) tokens.push(result.body.session.access_token);

    expect(results.filter((result) => result.status === 200)).toHaveLength(3);
    expect(results.filter((result) => result.status === 409)).toHaveLength(3);
    expect((await sessionStatus(tokens[0])).body.code).toBe('SESSION_ACTIVE');
  });

  it('libera o novo login somente após o encerramento explícito de uma sessão escolhida', async () => {
    for (let index = 0; index < 3; index += 1) await open();
    const limited = await login(USERS.limit);
    const [chosen, ...others] = limited.body.sessions as ActiveSession[];

    const freed = await login({ ...USERS.limit, revoke_session_id: chosen!.session_id });
    expect(freed.status).toBe(200);
    tokens.push(freed.body.session.access_token);

    const statuses = await Promise.all(tokens.map((token) => sessionStatus(token)));
    const active = statuses.filter((status) => status.body.code === 'SESSION_ACTIVE').length;
    expect(active).toBe(3);
    expect(others).toHaveLength(2);
  });

  it('não permite encerrar sessão de outro usuário pelo campo de encerramento explícito', async () => {
    const other = await login(USERS.other);
    tokens.push(other.body.session.access_token);
    const otherSessionId = JSON.parse(Buffer.from(other.body.session.access_token.split('.')[1], 'base64url').toString()).session_id;

    for (let index = 0; index < 3; index += 1) await open();
    const attempt = await login({ ...USERS.limit, revoke_session_id: otherSessionId });

    expect(attempt.status).toBe(409);
    expect((await sessionStatus(other.body.session.access_token)).body.code).toBe('SESSION_ACTIVE');
  });

  it('o logout comum encerra somente a sessão atual', async () => {
    for (let index = 0; index < 2; index += 1) await open();
    const [first, second] = tokens;
    await logout(first);
    expect((await sessionStatus(first)).status).toBe(401);
    expect((await sessionStatus(second)).body.code).toBe('SESSION_ACTIVE');
  });
});
