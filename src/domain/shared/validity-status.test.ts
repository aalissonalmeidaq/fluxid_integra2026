import { describe, expect, it } from 'vitest';
import { HYDROSTATIC_EXPIRING_DAYS } from '../cylinders/hydrostatic-status';
import { addCivilDays, daysBetween, todayInSaoPaulo } from './civil-date';
import { EXPIRING_DAYS, validityStatus } from './validity-status';

// Hoje de referência dos casos: 07/10/2026.
const HOJE = '2026-10-07';

describe('validityStatus (licenciamento do veículo e validade da CNH)', () => {
  it.each([
    ['31 dias: em dia', addCivilDays(HOJE, 31), 'em_dia'],
    ['30 dias: a vencer (limite)', addCivilDays(HOJE, 30), 'a_vencer'],
    ['1 dia: a vencer', addCivilDays(HOJE, 1), 'a_vencer'],
    ['hoje: a vencer, ainda vale', HOJE, 'a_vencer'],
    ['ontem: vencido', addCivilDays(HOJE, -1), 'vencido'],
    ['muito antes: vencido', addCivilDays(HOJE, -400), 'vencido'],
    ['sem data', null, 'sem_data'],
  ] as const)('%s', (_nome, dueOn, esperado) => {
    expect(validityStatus(dueOn, HOJE)).toBe(esperado);
  });

  it('usa o dia de America/Sao_Paulo quando a data de hoje não é informada', () => {
    const hoje = todayInSaoPaulo();
    expect(validityStatus(hoje)).toBe('a_vencer');
    expect(validityStatus(addCivilDays(hoje, -1))).toBe('vencido');
    expect(validityStatus(addCivilDays(hoje, EXPIRING_DAYS + 1))).toBe('em_dia');
  });
});

describe('limite único de "a vencer" (RF-022)', () => {
  it('é de 30 dias e é o mesmo do teste hidrostático da Spec 006', () => {
    expect(EXPIRING_DAYS).toBe(30);
    expect(HYDROSTATIC_EXPIRING_DAYS).toBe(EXPIRING_DAYS);
  });
});

describe('datas civis (sem milissegundos UTC, sem horário de verão)', () => {
  it('somam dias atravessando mês, ano e fevereiro bissexto', () => {
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addCivilDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-07', addCivilDays('2026-10-07', 365))).toBe(365);
  });

  it('mudam de dia às 00h de São Paulo (03h UTC), e não às 00h UTC', () => {
    expect(todayInSaoPaulo(new Date('2026-10-08T02:59:59Z'))).toBe('2026-10-07');
    expect(todayInSaoPaulo(new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-08');
  });
});
