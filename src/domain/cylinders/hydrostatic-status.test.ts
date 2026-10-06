import { describe, expect, it } from 'vitest';
import { HYDROSTATIC_EXPIRING_DAYS, addCivilDays, daysBetween, effectiveTest, hydrostaticStatus, todayInSaoPaulo } from './hydrostatic-status';
import { validateHydrostaticTestForm } from './cylinder-validation';

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

describe('todayInSaoPaulo (fuso explícito, independente da máquina)', () => {
  it('entre 21h e 24h em São Paulo o UTC já é o dia seguinte, e o dia de São Paulo prevalece', () => {
    // 22h30 em São Paulo (UTC-3) de 05/10/2026 = 01h30 UTC de 06/10/2026.
    const instante = new Date('2026-10-06T01:30:00Z');
    expect(instante.toISOString().slice(0, 10)).toBe('2026-10-06');
    expect(todayInSaoPaulo(instante)).toBe('2026-10-05');
  });

  it('muda de dia às 00h de São Paulo (03h UTC), e não às 00h UTC', () => {
    expect(todayInSaoPaulo(new Date('2026-10-06T02:59:59Z'))).toBe('2026-10-05');
    expect(todayInSaoPaulo(new Date('2026-10-06T03:00:00Z'))).toBe('2026-10-06');
  });

  it('a data de realização do dia de São Paulo é aceita e a do dia UTC seguinte é recusada como futura', () => {
    const instante = new Date('2026-10-06T01:30:00Z');
    const formulario = (performedOn: string) => validateHydrostaticTestForm(
      { performedOn, result: 'approved', reportNumber: '', executor: 'Lab', nextDueOn: addCivilDays(performedOn, 180), notes: '' }, todayInSaoPaulo(instante));
    expect(formulario('2026-10-05').ok).toBe(true);
    expect(formulario('2026-10-06').ok).toBe(false);
  });
});

describe('addCivilDays (datas de calendário, sem milissegundos UTC)', () => {
  it('soma e subtrai dias atravessando mês, ano e fevereiro bissexto', () => {
    expect(addCivilDays('2026-10-05', 180)).toBe('2027-04-03');
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCivilDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCivilDays('2026-10-05', -3)).toBe('2026-10-02');
    expect(addCivilDays('2026-10-05', 0)).toBe('2026-10-05');
  });

  it('não sofre com a virada do horário de verão (período em que o Brasil usava) nem com o fuso da máquina', () => {
    expect(addCivilDays('2018-11-03', 1)).toBe('2018-11-04');
    expect(addCivilDays('2019-02-16', 1)).toBe('2019-02-17');
    expect(daysBetween('2026-10-05', addCivilDays('2026-10-05', 365))).toBe(365);
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
