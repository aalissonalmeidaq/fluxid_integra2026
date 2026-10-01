import { describe, expect, it } from 'vitest';
import { OfflineOperationPolicy } from './offline-operation-policy';

describe('OfflineOperationPolicy', () => {
  it.each([
    'identity.profile.update',
    'session.create',
    'invitation.send',
    'rbac.role.assign',
    'audit.export',
    'administration.organization.update',
  ])('rejeita %s porque a allowlist da Spec 002 é vazia', (operation) => {
    const policy = new OfflineOperationPolicy();
    expect(policy.isAllowed(operation)).toBe(false);
    expect(() => policy.assertAllowed(operation)).toThrow(/não homologada/i);
  });

  it('não permite ampliar a allowlist em tempo de execução', () => {
    const policy = new OfflineOperationPolicy();
    expect(Object.isFrozen(policy.allowedOperations())).toBe(true);
    expect(policy.allowedOperations()).toEqual([]);
  });

  it('deve rejeitar test_synthetic_operation fora do harness', () => {
    const policy = new OfflineOperationPolicy();
    expect(policy.isAllowed('test_synthetic_operation')).toBe(false);
  });
});
