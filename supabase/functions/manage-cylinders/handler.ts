import {
  createCylinderHandler, type CylinderGateway, type OperationSpec, type Rule,
} from '../_shared/cylinders.ts';

export type { CylinderGateway } from '../_shared/cylinders.ts';

const justification: Rule = { t: 'text', max: 500 };
const testFields = (): Record<string, [Rule, string]> => ({
  performed_on: [{ t: 'date' }, 'p_performed_on'],
  result: [{ t: 'enum', values: ['approved', 'rejected'] }, 'p_result'],
  report_number: [{ t: 'text', max: 60, nullable: true, optional: true }, 'p_report_number'],
  executor: [{ t: 'text', max: 120 }, 'p_executor'],
  next_due_on: [{ t: 'date', nullable: true, optional: true }, 'p_next_due_on'],
  notes: [{ t: 'text', max: 500, nullable: true, optional: true }, 'p_notes'],
});
const cylinderFields = (): Record<string, [Rule, string]> => ({
  cylinder_type_id: [{ t: 'uuid' }, 'p_type'],
  serial_number: [{ t: 'text', max: 60 }, 'p_serial'],
  manufacturer: [{ t: 'text', max: 120, nullable: true, optional: true }, 'p_manufacturer'],
  manufacture_year: [{ t: 'int', min: 1900, max: 9999, nullable: true, optional: true }, 'p_year'],
  working_pressure_bar: [{ t: 'number', min: 0.01, nullable: true, optional: true }, 'p_pressure'],
  notes: [{ t: 'text', max: 500, nullable: true, optional: true }, 'p_notes'],
});

// Comandos de cilindros: sempre auditados e atômicos no banco. NÃO existe operação de exclusão (RF-005).
export const MANAGE_OPERATIONS: Record<string, OperationSpec> = {
  create: { rpc: 'create_cylinder', action: 'cylinder.create', fields: { ...cylinderFields(), identifier: [{ t: 'identifier' }, 'p_identifier'] } },
  update: {
    rpc: 'update_cylinder', action: 'cylinder.update',
    fields: { cylinder_id: [{ t: 'uuid' }, 'p_cylinder'], expected_version: [{ t: 'int', min: 1 }, 'p_expected_version'], ...cylinderFields() },
  },
  save_type: {
    rpc: 'save_cylinder_type', action: 'cylinder.type_save',
    fields: {
      type_id: [{ t: 'uuid', optional: true }, 'p_type'],
      gas: [{ t: 'text', max: 80 }, 'p_gas'],
      capacity_value: [{ t: 'number', min: 0.01 }, 'p_capacity_value'],
      capacity_unit: [{ t: 'enum', values: ['l', 'm3', 'kg'] }, 'p_capacity_unit'],
      classification: [{ t: 'enum', values: ['medicinal', 'industrial'] }, 'p_classification'],
      active: [{ t: 'bool', optional: true }, 'p_active'],
    },
  },
  inactivate: {
    rpc: 'inactivate_cylinder', action: 'cylinder.inactivate',
    fields: {
      cylinder_id: [{ t: 'uuid' }, 'p_cylinder'],
      reason: [{ t: 'enum', values: ['written_off', 'lost', 'condemned', 'other'] }, 'p_reason'],
      justification: [justification, 'p_justification'],
    },
  },
  reactivate: { rpc: 'reactivate_cylinder', action: 'cylinder.reactivate', fields: { cylinder_id: [{ t: 'uuid' }, 'p_cylinder'], justification: [justification, 'p_justification'] } },
  add_identifier: {
    rpc: 'add_cylinder_identifier', action: 'cylinder.identifier_add',
    fields: {
      cylinder_id: [{ t: 'uuid' }, 'p_cylinder'],
      kind: [{ t: 'enum', values: ['qr_code', 'data_matrix', 'nfc_tag', 'hull_number'] }, 'p_kind'],
      value: [{ t: 'text', max: 200, noBreaks: true }, 'p_value'],
    },
  },
  deactivate_identifier: {
    rpc: 'deactivate_cylinder_identifier', action: 'cylinder.identifier_deactivate',
    fields: { identifier_id: [{ t: 'uuid' }, 'p_identifier'], justification: [justification, 'p_justification'] },
  },
  transfer_identifier: {
    rpc: 'transfer_cylinder_identifier', action: 'cylinder.identifier_transfer',
    fields: {
      value: [{ t: 'text', max: 200, noBreaks: true }, 'p_value'],
      target_cylinder_id: [{ t: 'uuid' }, 'p_target'],
      justification: [justification, 'p_justification'],
      confirmed: [{ t: 'literal-true' }, 'p_confirmed'],
    },
  },
  stock_in: {
    rpc: 'stock_in_cylinder', action: 'cylinder.stock_in',
    fields: { identifier_value: [{ t: 'text', max: 200, noBreaks: true }, 'p_identifier_value'], operation_key: [{ t: 'uuid' }, 'p_operation_key'] },
  },
  register_test: { rpc: 'register_hydrostatic_test', action: 'cylinder.test_register', fields: { cylinder_id: [{ t: 'uuid' }, 'p_cylinder'], ...testFields() } },
  rectify_test: {
    rpc: 'rectify_hydrostatic_test', action: 'cylinder.test_rectify',
    fields: { test_id: [{ t: 'uuid' }, 'p_test'], ...testFields(), justification: [justification, 'p_justification'] },
  },
};

export function createManageCylindersHandler(gateway: CylinderGateway) {
  return createCylinderHandler(gateway, MANAGE_OPERATIONS);
}
