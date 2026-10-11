import { todayInSaoPaulo } from '../shared/civil-date';
import { validityStatus, type ValidityStatus } from '../shared/validity-status';
import { hydrostaticStatus } from '../cylinders/hydrostatic-status';
import type { HydrostaticResult } from '../cylinders/cylinder-types';
import type { CylinderRefusalReason } from './trip-vocabulary';

// Elegibilidade para entrar numa viagem (RF-005, RF-011, premissa 5). O servidor repete tudo e é quem decide; aqui se evita a ida e volta.

export interface EligibleCylinder {
  status: 'active' | 'inactive';
  stockStatus: 'in_stock' | 'out_of_stock';
  hydroLastResult: HydrostaticResult | null;
  hydroNextDueOn: string | null;
}

export type CylinderEligibility =
  | { eligible: true; hydroStatus: 'em_dia' | 'a_vencer'; warning: 'hydro_expiring' | null }
  | { eligible: false; reason: CylinderRefusalReason };

// Cilindro ativo, em estoque e com teste em dia ou a vencer. Teste vencido ou reprovado não tem exceção (Clarifications); cilindro sem
// teste registrado também não entra, porque o requisito exige o teste em dia ou a vencer.
export function cylinderEligibility(cylinder: EligibleCylinder, today: string = todayInSaoPaulo()): CylinderEligibility {
  if (cylinder.status !== 'active') return { eligible: false, reason: 'inactive' };
  if (cylinder.stockStatus !== 'in_stock') return { eligible: false, reason: 'out_of_stock' };
  const hydro = hydrostaticStatus(cylinder.hydroLastResult, cylinder.hydroNextDueOn, today);
  if (hydro === 'reprovado') return { eligible: false, reason: 'hydro_rejected' };
  if (hydro === 'vencido') return { eligible: false, reason: 'hydro_expired' };
  if (hydro === 'sem_teste') return { eligible: false, reason: 'hydro_missing' };
  return { eligible: true, hydroStatus: hydro, warning: hydro === 'a_vencer' ? 'hydro_expiring' : null };
}

export type VehicleEligibility = { eligible: true } | { eligible: false; reason: 'maintenance' | 'inactive' };

export function vehicleEligibility(status: 'available' | 'maintenance' | 'inactive'): VehicleEligibility {
  return status === 'available' ? { eligible: true } : { eligible: false, reason: status };
}

export interface EligibleDriver {
  status: 'active' | 'inactive';
  cnhValidUntil: string;
}

export type DriverEligibility =
  | { eligible: true; cnhStatus: ValidityStatus; warning: 'cnh_expiring' | 'cnh_expired' | null }
  | { eligible: false; reason: 'inactive' | 'cnh_expired' };

// Planejar com motorista de CNH vencida só avisa; iniciar a viagem é que não pode (RF-011). Motorista inativo nunca entra.
export function driverEligibility(driver: EligibleDriver, moment: 'plan' | 'start', today: string = todayInSaoPaulo()): DriverEligibility {
  if (driver.status !== 'active') return { eligible: false, reason: 'inactive' };
  const cnhStatus = validityStatus(driver.cnhValidUntil, today);
  if (cnhStatus === 'vencido') {
    return moment === 'start' ? { eligible: false, reason: 'cnh_expired' } : { eligible: true, cnhStatus, warning: 'cnh_expired' };
  }
  return { eligible: true, cnhStatus, warning: cnhStatus === 'a_vencer' ? 'cnh_expiring' : null };
}

// Licenciamento vencido do veículo só avisa (premissa 5); nunca impede a viagem.
export function licensingWarning(licensingDueOn: string | null, today: string = todayInSaoPaulo()): 'licensing_expired' | 'licensing_expiring' | null {
  const status = validityStatus(licensingDueOn, today);
  if (status === 'vencido') return 'licensing_expired';
  return status === 'a_vencer' ? 'licensing_expiring' : null;
}
