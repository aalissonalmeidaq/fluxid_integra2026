import { createOperationsHandler, type OperationAuditEvent, type OperationSpec, type OperationsGateway } from './operations.ts';

// Borda das Edge Functions de cilindros (Spec 006). A lógica comum vive em `operations.ts` (extraída na Spec 007 sem mudar o
// comportamento); este arquivo mantém os nomes e as constantes que as funções de cilindros já importavam.
export { IDENTIFIER_KINDS, type Identity, type OperationSpec, type Rule } from './operations.ts';

export type CylinderAuditEvent = OperationAuditEvent;
export type CylinderGateway = OperationsGateway;

export const HYDRO_STATUSES = ['em_dia', 'a_vencer', 'vencido', 'reprovado', 'sem_teste'] as const;
export const EVENT_TYPES = [
  'cylinder_created', 'cylinder_updated', 'cylinder_inactivated', 'cylinder_reactivated', 'identifier_added', 'identifier_deactivated',
  'identifier_transferred_out', 'identifier_transferred_in', 'stock_in', 'stock_out_inactivation', 'hydrostatic_test_registered',
  'hydrostatic_test_rectified',
] as const;

export function createCylinderHandler(gateway: CylinderGateway, operations: Record<string, OperationSpec>) {
  return createOperationsHandler(gateway, operations, { prefix: 'cylinder' });
}
