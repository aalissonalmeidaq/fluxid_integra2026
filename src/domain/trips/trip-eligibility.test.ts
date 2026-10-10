import { describe, expect, it } from 'vitest';
import { cylinderEligibility, driverEligibility, licensingWarning, vehicleEligibility, type EligibleCylinder } from './trip-eligibility';

const TODAY = '2026-10-09';
const ok: EligibleCylinder = { status: 'active', stockStatus: 'in_stock', hydroLastResult: 'approved', hydroNextDueOn: '2027-10-09' };

describe('cylinderEligibility (RF-005)', () => {
  it('aceita cilindro ativo, em estoque e com teste em dia', () => {
    expect(cylinderEligibility(ok, TODAY)).toEqual({ eligible: true, hydroStatus: 'em_dia', warning: null });
  });

  it('aceita teste a vencer e avisa', () => {
    expect(cylinderEligibility({ ...ok, hydroNextDueOn: '2026-11-08' }, TODAY)).toEqual({ eligible: true, hydroStatus: 'a_vencer', warning: 'hydro_expiring' });
  });

  it('o teste vale até o fim do dia do vencimento', () => {
    expect(cylinderEligibility({ ...ok, hydroNextDueOn: TODAY }, TODAY)).toMatchObject({ eligible: true, hydroStatus: 'a_vencer' });
  });

  it('recusa teste vencido, sem exceção', () => {
    expect(cylinderEligibility({ ...ok, hydroNextDueOn: '2026-10-08' }, TODAY)).toEqual({ eligible: false, reason: 'hydro_expired' });
  });

  it('recusa teste reprovado', () => {
    expect(cylinderEligibility({ ...ok, hydroLastResult: 'rejected' }, TODAY)).toEqual({ eligible: false, reason: 'hydro_rejected' });
  });

  it('recusa cilindro sem teste registrado', () => {
    expect(cylinderEligibility({ ...ok, hydroLastResult: null, hydroNextDueOn: null }, TODAY)).toEqual({ eligible: false, reason: 'hydro_missing' });
  });

  it('recusa cilindro inativo antes de olhar o resto', () => {
    expect(cylinderEligibility({ ...ok, status: 'inactive', stockStatus: 'out_of_stock', hydroLastResult: 'rejected' }, TODAY)).toEqual({ eligible: false, reason: 'inactive' });
  });

  it('recusa cilindro fora do estoque', () => {
    expect(cylinderEligibility({ ...ok, stockStatus: 'out_of_stock' }, TODAY)).toEqual({ eligible: false, reason: 'out_of_stock' });
  });
});

describe('vehicleEligibility', () => {
  it('só veículo disponível', () => {
    expect(vehicleEligibility('available')).toEqual({ eligible: true });
    expect(vehicleEligibility('maintenance')).toEqual({ eligible: false, reason: 'maintenance' });
    expect(vehicleEligibility('inactive')).toEqual({ eligible: false, reason: 'inactive' });
  });
});

describe('driverEligibility (RF-011)', () => {
  it('motorista inativo nunca entra', () => {
    expect(driverEligibility({ status: 'inactive', cnhValidUntil: '2030-01-01' }, 'plan', TODAY)).toEqual({ eligible: false, reason: 'inactive' });
    expect(driverEligibility({ status: 'inactive', cnhValidUntil: '2030-01-01' }, 'start', TODAY)).toEqual({ eligible: false, reason: 'inactive' });
  });

  it('CNH em dia passa nos dois momentos', () => {
    const driver = { status: 'active' as const, cnhValidUntil: '2030-01-01' };
    expect(driverEligibility(driver, 'plan', TODAY)).toEqual({ eligible: true, cnhStatus: 'em_dia', warning: null });
    expect(driverEligibility(driver, 'start', TODAY)).toEqual({ eligible: true, cnhStatus: 'em_dia', warning: null });
  });

  it('CNH a vencer só avisa', () => {
    const driver = { status: 'active' as const, cnhValidUntil: '2026-10-20' };
    expect(driverEligibility(driver, 'start', TODAY)).toEqual({ eligible: true, cnhStatus: 'a_vencer', warning: 'cnh_expiring' });
  });

  it('CNH vencida só avisa ao planejar e impede iniciar', () => {
    const driver = { status: 'active' as const, cnhValidUntil: '2026-10-08' };
    expect(driverEligibility(driver, 'plan', TODAY)).toEqual({ eligible: true, cnhStatus: 'vencido', warning: 'cnh_expired' });
    expect(driverEligibility(driver, 'start', TODAY)).toEqual({ eligible: false, reason: 'cnh_expired' });
  });

  it('a CNH vale até o fim do dia da validade', () => {
    expect(driverEligibility({ status: 'active', cnhValidUntil: TODAY }, 'start', TODAY)).toMatchObject({ eligible: true, cnhStatus: 'a_vencer' });
  });
});

describe('licensingWarning (premissa 5)', () => {
  it('licenciamento vencido ou a vencer só avisa', () => {
    expect(licensingWarning('2026-10-08', TODAY)).toBe('licensing_expired');
    expect(licensingWarning('2026-10-30', TODAY)).toBe('licensing_expiring');
    expect(licensingWarning('2027-10-30', TODAY)).toBeNull();
    expect(licensingWarning(null, TODAY)).toBeNull();
  });
});
