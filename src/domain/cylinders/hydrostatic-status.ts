import type { HydrostaticResult, HydrostaticStatus } from './cylinder-types';
import { EXPIRING_DAYS } from '../shared/validity-status';
import { addCivilDays, daysBetween, todayInSaoPaulo } from '../shared/civil-date';

// As datas civis moraram aqui na Spec 006; agora vivem em src/domain/shared/civil-date.ts e continuam exportadas daqui.
export { addCivilDays, daysBetween, todayInSaoPaulo };

// Limite único de "a vencer" para todo o produto (RF-021): o mesmo de src/domain/shared/validity-status.ts. O SQL tem o mesmo
// valor em private.hydrostatic_expiring_days(); tests/contract/cylinders-hydrostatic-limit.test.ts reprova divergência.
export const HYDROSTATIC_EXPIRING_DAYS = EXPIRING_DAYS;

// Situação calculada do teste (RF-020): nunca digitada, sempre derivada do último teste efetivo e de hoje.
export function hydrostaticStatus(
  lastResult: HydrostaticResult | null,
  nextDueOn: string | null,
  today: string = todayInSaoPaulo(),
): HydrostaticStatus {
  if (lastResult === null) return 'sem_teste';
  if (lastResult === 'rejected') return 'reprovado';
  if (nextDueOn === null) return 'sem_teste';
  const days = daysBetween(today, nextDueOn);
  if (days < 0) return 'vencido';
  if (days <= HYDROSTATIC_EXPIRING_DAYS) return 'a_vencer';
  return 'em_dia';
}

export interface HydrostaticTestRecord {
  id: string;
  performedOn: string;
  createdAt: string;
  result: HydrostaticResult;
  nextDueOn: string | null;
  rectifiesTestId: string | null;
}

// Teste efetivo: o de maior data de realização (desempate pela criação) entre os que não foram retificados (RF-022).
export function effectiveTest<T extends HydrostaticTestRecord>(tests: readonly T[]): T | null {
  const rectified = new Set(tests.map((test) => test.rectifiesTestId).filter((id): id is string => id !== null));
  const candidates = tests.filter((test) => !rectified.has(test.id));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, test) => {
    if (test.performedOn !== best.performedOn) return test.performedOn > best.performedOn ? test : best;
    return test.createdAt >= best.createdAt ? test : best;
  });
}
