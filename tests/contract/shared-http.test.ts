import { describe, expect, it } from 'vitest';
import { decodeClaims } from '../../supabase/functions/_shared/http.ts';

const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (claims: unknown) => `${base64Url({ alg: 'none' })}.${base64Url(claims)}.assinatura-sintetica`;

describe('decodeClaims (leitura de claims de um token já validado pelo Auth)', () => {
  it('lê sub, session_id e aal do payload', () => {
    expect(decodeClaims(token({ sub: 'u-1', session_id: 's-1', aal: 'aal2' }))).toEqual({ sub: 'u-1', session_id: 's-1', aal: 'aal2' });
  });

  it('aceita base64url com caracteres - e _ e sem preenchimento', () => {
    const claims = { sub: 'usuário-ação>>??', session_id: 's' };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64');
    expect(payload).toMatch(/[+/]|=/);
    expect(decodeClaims(`x.${payload.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`).session_id).toBe('s');
  });

  it.each([
    ['token sem payload', 'sem-pontos'],
    ['payload que não é base64', 'a.@@@@.c'],
    ['payload que não é JSON', `a.${Buffer.from('não é json').toString('base64url')}.c`],
    ['payload vazio', 'a..c'],
  ])('devolve claims vazias para %s, sem lançar erro', (_name, value) => {
    expect(decodeClaims(value)).toEqual({});
  });
});
