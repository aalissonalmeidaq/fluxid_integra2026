import { describe, expect, it } from 'vitest';
import { authReducer, initialAuthState, isProtectedAccessAllowed, type AuthEvent, type AuthState } from './session';


const reduce = (events: AuthEvent[], from: AuthState = initialAuthState) => events.reduce(authReducer, from);

describe('authReducer', () => {
  it('começa verificando a sessão restaurada', () => {
    expect(initialAuthState).toEqual({ status: 'checking' });
  });

  it('restaura sessão ativa como autenticada', () => {
    expect(reduce([{ type: 'session_active', aal: 'aal1' }])).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it('Spec 013 (RF-021): perfil global também restaura autenticado só com e-mail e senha', () => {
    expect(reduce([{ type: 'session_active', aal: 'aal1' }])).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it('sem sessão restaurada exige login, sem aviso', () => {
    expect(reduce([{ type: 'session_missing' }])).toEqual({ status: 'signed_out' });
  });

  it('login com sucesso autentica em AAL1', () => {
    expect(reduce([{ type: 'login_succeeded' }])).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it.each([
    ['timebox', 'session_expired'],
    ['inactivity', 'session_expired'],
  ] as const)('sessão expirada por %s conduz ao login com aviso', (reason, notice) => {
    const state = reduce([{ type: 'session_active', aal: 'aal1' }, { type: 'session_expired', reason }]);
    expect(state).toEqual({ status: 'signed_out', notice, reason });
  });

  it('sessão revogada conduz ao login com aviso próprio', () => {
    expect(reduce([{ type: 'session_active', aal: 'aal1' }, { type: 'session_revoked' }])).toEqual({
      status: 'signed_out', notice: 'session_revoked',
    });
  });

  it('logout conduz a uma área pública com aviso de saída', () => {
    expect(reduce([{ type: 'session_active', aal: 'aal1' }, { type: 'logout' }])).toEqual({
      status: 'signed_out', notice: 'signed_out',
    });
  });

  it('nova tentativa de login limpa o aviso anterior', () => {
    const expired = reduce([{ type: 'session_expired' }]);
    expect(reduce([{ type: 'login_succeeded' }], expired)).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it('sessão inválida sem aviso volta ao login', () => {
    expect(reduce([{ type: 'session_invalid' }])).toEqual({ status: 'signed_out' });
  });
});

describe('isProtectedAccessAllowed', () => {
  it('libera somente sessão autenticada', () => {
    expect(isProtectedAccessAllowed({ status: 'authenticated', aal: 'aal1' })).toBe(true);
    for (const status of ['checking', 'signed_out'] as const) {
      expect(isProtectedAccessAllowed({ status })).toBe(false);
    }
  });

  it('Spec 013 (RF-021): nenhuma tela exige segundo fator', () => {
    expect(isProtectedAccessAllowed({ status: 'authenticated', aal: 'aal1' })).toBe(true);
  });
});
