import { describe, expect, it } from 'vitest';
import { HYDROSTATIC_EXPIRING_DAYS, daysBetween, effectiveTest, hydrostaticStatus } from './hydrostatic-status';

// Mesma tabela de casos de supabase/tests/006_hydrostatic.test.sql (CA-008). Hoje: 05/10/2026.
const HOJE = '2026-10-05';

describe('HYDROSTATIC_EXPIRING_DAYS', () => {
  it('o limite de "a vencer" é de 30 dias, definido uma só vez (RF-021)', () => {
    expect(HYDROSTATIC_EXPIRING_DAYS).toBe(30);
  });
});

describe('daysBetween', () => {
  it('conta dias de calendário, sem efeito de horário de verão', () => {
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0);
    expect(daysBetween('2026-10-05', '2026-11-04')).toBe(30);
    expect(daysBetween('2026-10-05', '2026-10-04')).toBe(-1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('hydrostaticStatus', () => {
  it.each([
    ['sem teste', null, null, 'sem_teste'],
    ['reprovado', 'rejected', null, 'reprovado'],
    ['reprovado vale mesmo com data futura', 'rejected', '2030-01-01', 'reprovado'],
    ['ontem: vencido', 'approved', '2026-10-04', 'vencido'],
    ['muito antigo: vencido', 'approved', '2025-01-01', 'vencido'],
    ['hoje: ainda a vencer', 'approved', '2026-10-05', 'a_vencer'],
    ['1 dia: a vencer', 'approved', '2026-10-06', 'a_vencer'],
    ['20 dias: a vencer', 'approved', '2026-10-25', 'a_vencer'],
    ['30 dias: a vencer', 'approved', '2026-11-04', 'a_vencer'],
    ['31 dias: em dia', 'approved', '2026-11-05', 'em_dia'],
    ['6 meses: em dia', 'approved', '2027-04-05', 'em_dia'],
  ] as const)('%s', (_nome, resultado, proxima, esperado) => {
    expect(hydrostaticStatus(resultado, proxima, HOJE)).toBe(esperado);
  });

  it('aprovado sem próxima data é tratado como sem teste (estado inconsistente)', () => {
    expect(hydrostaticStatus('approved', null, HOJE)).toBe('sem_teste');
  });
});

describe('effectiveTest (RF-022)', () => {
  const teste = (id: string, performedOn: string, result: 'approved' | 'rejected', nextDueOn: string | null, rectifiesTestId: string | null = null, createdAt = `${performedOn}T10:00:00Z`) =>
    ({ id, performedOn, createdAt, result, nextDueOn, rectifiesTestId });

  it('sem registros não há teste efetivo', () => {
    expect(effectiveTest([])).toBeNull();
  });

  it('o mais recente por data de realização é o efetivo', () => {
    const testes = [teste('a', '2025-01-10', 'approved', '2026-01-10'), teste('b', '2026-01-10', 'rejected', null)];
    expect(effectiveTest(testes)?.id).toBe('b');
  });

  it('reprovado vale até um aprovado posterior', () => {
    const testes = [teste('a', '2026-01-10', 'rejected', null), teste('b', '2026-02-10', 'approved', '2027-02-10')];
    const efetivo = effectiveTest(testes);
    expect(efetivo?.id).toBe('b');
    expect(hydrostaticStatus(efetivo?.result ?? null, efetivo?.nextDueOn ?? null, '2026-03-01')).toBe('em_dia');
  });

  it('a retificação substitui o original na leitura, que continua existindo', () => {
    const testes = [teste('a', '2026-01-10', 'approved', '2026-02-01'), teste('b', '2026-01-10', 'approved', '2027-01-10', 'a', '2026-01-11T10:00:00Z')];
    expect(effectiveTest(testes)?.id).toBe('b');
    expect(testes).toHaveLength(2);
  });

  it('empate de data é decidido pela criação mais recente', () => {
    const testes = [teste('a', '2026-01-10', 'approved', '2027-01-10', null, '2026-01-10T08:00:00Z'), teste('b', '2026-01-10', 'rejected', null, null, '2026-01-10T09:00:00Z')];
    expect(effectiveTest(testes)?.id).toBe('b');
  });
});
