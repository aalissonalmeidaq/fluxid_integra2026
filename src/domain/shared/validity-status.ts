import { daysBetween, todayInSaoPaulo } from './civil-date';

// Limite único de "a vencer" para todo o produto (Spec 006, RF-021, e Spec 007, RF-022): licenciamento do veículo, validade
// da CNH e teste hidrostático. O SQL tem o mesmo valor em private.hydrostatic_expiring_days() (e private.document_expiring_days()
// devolve esse mesmo número); tests/contract/registry-limits.test.ts reprova divergência.
export const EXPIRING_DAYS = 30;

export type ValidityStatus = 'em_dia' | 'a_vencer' | 'vencido' | 'sem_data';

// Situação calculada de um documento com validade (RF-022, RF-026): nunca digitada, sempre derivada da data e de hoje.
// No dia do vencimento o documento ainda vale ("a vencer"); só depois dele passa a "vencido".
export function validityStatus(dueOn: string | null, today: string = todayInSaoPaulo()): ValidityStatus {
  if (dueOn === null) return 'sem_data';
  const days = daysBetween(today, dueOn);
  if (days < 0) return 'vencido';
  if (days <= EXPIRING_DAYS) return 'a_vencer';
  return 'em_dia';
}
