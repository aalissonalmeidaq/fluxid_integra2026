// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { authReducer, initialAuthState, isProtectedAccessAllowed } from './session';


// Spec 010, T085 (RF-016a): a sessão restaurada pelo acesso offline é `authenticated` com a marca `offline`; a confirmação do servidor a substitui por
// uma sessão comum, e o resto da máquina de estados não muda.
describe('sessão restaurada offline', () => {
  it('session_offline_restored vira autenticado com a marca offline e o nível da última confirmação', () => {
    expect(authReducer(initialAuthState, { type: 'session_offline_restored', aal: 'aal1' })).toEqual({ status: 'authenticated', aal: 'aal1', offline: true });
    expect(authReducer(initialAuthState, { type: 'session_offline_restored', aal: 'aal2' })).toEqual({ status: 'authenticated', aal: 'aal2', offline: true });
  });

  it('o acesso protegido vale offline', () => {
    const offline = authReducer(initialAuthState, { type: 'session_offline_restored', aal: 'aal1' });
    expect(isProtectedAccessAllowed(offline)).toBe(true);
  });

  it('a confirmação do servidor tira a marca offline', () => {
    const offline = authReducer(initialAuthState, { type: 'session_offline_restored', aal: 'aal1' });
    expect(authReducer(offline, { type: 'session_active', aal: 'aal1' })).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it.each([
    [{ type: 'session_expired', reason: 'timebox' } as const, { status: 'signed_out', notice: 'session_expired', reason: 'timebox' }],
    [{ type: 'session_revoked' } as const, { status: 'signed_out', notice: 'session_revoked' }],
    [{ type: 'session_missing' } as const, { status: 'signed_out' }],
    [{ type: 'logout' } as const, { status: 'signed_out', notice: 'signed_out' }],
  ])('a sessão offline sai pelos mesmos caminhos de sempre (%j)', (event, expected) => {
    const offline = authReducer(initialAuthState, { type: 'session_offline_restored', aal: 'aal1' });
    expect(authReducer(offline, event)).toEqual(expected);
  });

  it('o login comum nunca carrega a marca offline', () => {
    expect(authReducer(initialAuthState, { type: 'login_succeeded' })).toEqual({ status: 'authenticated', aal: 'aal1' });
  });
});
