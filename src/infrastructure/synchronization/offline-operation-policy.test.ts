import { describe, expect, it } from 'vitest';
import { OFFLINE_OPERATIONS } from '@/domain/field/offline-queue-rules';
import { OfflineOperationPolicy } from './offline-operation-policy';

// Spec 002 deixou a lista vazia; a Spec 010 a preenche com exatamente as quatro operações de campo (RF-001, RF-003, CA-005).
describe('OfflineOperationPolicy', () => {
  it.each([
    'identity.profile.update',
    'session.create',
    'invitation.send',
    'rbac.role.assign',
    'audit.export',
    'administration.organization.update',
    // Operações de viagem que exigem conexão (Spec 010, RF-003): dependem de revalidação do servidor.
    'trip.create',
    'trip.start_loading',
    'trip.start_trip',
    'trip.cancel',
    'trip.complete',
    'trip.unlock',
    'trip.return',
    'trip.correct_delivery',
  ])('rejeita %s: não é uma das quatro operações de campo', (operation) => {
    const policy = new OfflineOperationPolicy();
    expect(policy.isAllowed(operation)).toBe(false);
    expect(() => policy.assertAllowed(operation)).toThrow(/não homologada/i);
  });

  it.each(['trip.check_item', 'trip.uncheck_item', 'trip.arrive_stop', 'trip.deliver'])('aceita %s', (operation) => {
    const policy = new OfflineOperationPolicy();
    expect(policy.isAllowed(operation)).toBe(true);
    expect(() => policy.assertAllowed(operation)).not.toThrow();
  });

  it('a lista é exatamente a das regras de domínio da fila, congelada e sem ampliar em tempo de execução', () => {
    const policy = new OfflineOperationPolicy();
    expect(Object.isFrozen(policy.allowedOperations())).toBe(true);
    expect([...policy.allowedOperations()]).toEqual([...OFFLINE_OPERATIONS]);
    expect(() => (policy.allowedOperations() as string[]).push('trip.cancel')).toThrow();
    expect(policy.isAllowed('trip.cancel')).toBe(false);
  });

  it('deve rejeitar test_synthetic_operation fora do harness', () => {
    const policy = new OfflineOperationPolicy();
    expect(policy.isAllowed('test_synthetic_operation')).toBe(false);
  });
});
