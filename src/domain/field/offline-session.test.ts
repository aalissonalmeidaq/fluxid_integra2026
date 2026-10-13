// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { OFFLINE_SESSION_EXPIRED_MESSAGE, OFFLINE_SESSION_MAX_MS, offlineSessionState } from './offline-session';

const confirmedAt = new Date('2026-10-12T08:00:00Z');
const at = (iso: string) => new Date(iso);

// RF-016a e research.md §18: offline vale o teto de 8 horas desde a última confirmação do servidor; a inatividade de 30 minutos não bloqueia.
describe('sessão local offline', () => {
  it('o teto é de 8 horas', () => expect(OFFLINE_SESSION_MAX_MS).toBe(8 * 60 * 60 * 1000));
  it('logo depois da confirmação, vale', () => {
    expect(offlineSessionState(confirmedAt, at('2026-10-12T08:01:00Z'))).toEqual({ allowed: true, remainingMs: OFFLINE_SESSION_MAX_MS - 60_000 });
  });
  it('a inatividade de 30 minutos não bloqueia offline', () => {
    expect(offlineSessionState(confirmedAt, at('2026-10-12T09:30:00Z')).allowed).toBe(true);
  });
  it('pouco antes das 8 horas ainda vale', () => {
    expect(offlineSessionState(confirmedAt, at('2026-10-12T15:59:59Z')).allowed).toBe(true);
  });
  it('passadas as 8 horas, bloqueia com o motivo', () => {
    expect(offlineSessionState(confirmedAt, at('2026-10-12T16:00:00Z'))).toEqual({ allowed: false, remainingMs: 0, reason: OFFLINE_SESSION_EXPIRED_MESSAGE });
    expect(OFFLINE_SESSION_EXPIRED_MESSAGE).toBe('Sessão offline expirada. Conecte-se para entrar de novo.');
  });
  it('sem nenhuma confirmação guardada, bloqueia', () => {
    expect(offlineSessionState(null, at('2026-10-12T08:00:00Z')).allowed).toBe(false);
  });
  it('relógio atrasado (agora antes da confirmação) vale, mas nunca passa de 8 horas restantes', () => {
    expect(offlineSessionState(confirmedAt, at('2026-10-12T07:00:00Z'))).toEqual({ allowed: true, remainingMs: OFFLINE_SESSION_MAX_MS });
  });
});
