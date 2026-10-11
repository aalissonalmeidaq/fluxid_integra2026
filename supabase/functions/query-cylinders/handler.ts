import {
  createCylinderHandler, EVENT_TYPES, HYDRO_STATUSES, type CylinderGateway, type OperationSpec,
} from '../_shared/cylinders.ts';

export type { CylinderGateway } from '../_shared/cylinders.ts';

// Consultas somente leitura de cilindros (contracts/operacoes-servidor.md). Sem auditoria de sucesso; negações são auditadas.
export const QUERY_OPERATIONS: Record<string, OperationSpec> = {
  list: {
    rpc: 'query_cylinders_list',
    fields: {
      search: [{ t: 'text', max: 200, nullable: true, optional: true }, 'p_search'],
      status: [{ t: 'enum', values: ['active', 'inactive', 'all'], optional: true }, 'p_status'],
      stock_status: [{ t: 'enum', values: ['in_stock', 'out_of_stock'], optional: true }, 'p_stock_status'],
      hydro_status: [{ t: 'enum', values: HYDRO_STATUSES, optional: true }, 'p_hydro_status'],
      custody: [{ t: 'enum', values: ['in_organization', 'in_transit', 'at_customer'], optional: true }, 'p_custody'],
      cylinder_type_id: [{ t: 'uuid', optional: true }, 'p_type'],
      sort: [{ t: 'enum', values: ['serial', 'serial_desc'], optional: true }, 'p_sort'],
      cursor: [{ t: 'text', max: 200, nullable: true, optional: true }, 'p_cursor'],
      limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'],
    },
  },
  get: { rpc: 'query_cylinder_get', fields: { cylinder_id: [{ t: 'uuid' }, 'p_cylinder'] } },
  lookup: { rpc: 'query_cylinder_lookup', fields: { identifier_value: [{ t: 'text', max: 200, noBreaks: true }, 'p_identifier_value'] } },
  history: {
    rpc: 'query_cylinder_history',
    fields: {
      cylinder_id: [{ t: 'uuid' }, 'p_cylinder'],
      event_type: [{ t: 'enum', values: EVENT_TYPES, optional: true }, 'p_event_type'],
      from: [{ t: 'date', optional: true }, 'p_from'],
      to: [{ t: 'date', optional: true }, 'p_to'],
      order: [{ t: 'enum', values: ['asc', 'desc'], optional: true }, 'p_order'],
      cursor: [{ t: 'text', max: 200, nullable: true, optional: true }, 'p_cursor'],
      limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'],
    },
  },
  catalog: { rpc: 'query_cylinder_catalog', fields: {} },
};

export function createQueryCylindersHandler(gateway: CylinderGateway) {
  return createCylinderHandler(gateway, QUERY_OPERATIONS);
}
