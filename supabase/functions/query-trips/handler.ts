import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Consultas somente leitura das viagens da Fase 4 (contracts/operacoes-servidor.md). Sem auditoria de sucesso; negações são
// auditadas. O nome do recebedor só sai a quem tem `trip.recipient`: isso é garantido na RPC, nunca aqui.
const search: Rule = { t: 'text', max: 200, nullable: true, optional: true };
const cursor: Rule = { t: 'text', max: 400, nullable: true, optional: true };
const limit: Rule = { t: 'int', min: 1, max: 100, optional: true };
const STATUSES = ['open', 'planned', 'loading', 'in_progress', 'completed', 'cancelled', 'all'] as const;

export const QUERY_OPERATIONS: Record<string, OperationSpec> = {
  list_trips: {
    rpc: 'list_trips',
    fields: {
      search: [search, 'p_search'],
      status: [{ t: 'enum', values: STATUSES, optional: true }, 'p_status'],
      from: [{ t: 'date', optional: true }, 'p_from'],
      to: [{ t: 'date', optional: true }, 'p_to'],
      vehicle_id: [{ t: 'uuid', optional: true }, 'p_vehicle'],
      driver_id: [{ t: 'uuid', optional: true }, 'p_driver'],
      customer_id: [{ t: 'uuid', optional: true }, 'p_customer'],
      custody: [{ t: 'enum', values: ['in_organization', 'in_transit', 'at_customer'], optional: true }, 'p_custody'],
      sort: [{ t: 'enum', values: ['number_desc', 'number_asc', 'date_desc', 'date_asc'], optional: true }, 'p_sort'],
      cursor: [cursor, 'p_cursor'],
      limit: [limit, 'p_limit'],
    },
  },
  get_trip: { rpc: 'get_trip', fields: { trip_id: [{ t: 'uuid' }, 'p_trip'] } },
  trip_options: { rpc: 'trip_options', fields: { search: [search, 'p_search'] } },
  trip_history: {
    rpc: 'trip_history',
    fields: {
      trip_id: [{ t: 'uuid' }, 'p_trip'],
      event_type: [{ t: 'text', max: 40, nullable: true, optional: true }, 'p_event_type'],
      from: [{ t: 'date', optional: true }, 'p_from'],
      to: [{ t: 'date', optional: true }, 'p_to'],
      order: [{ t: 'enum', values: ['asc', 'desc'], optional: true }, 'p_order'],
      cursor: [cursor, 'p_cursor'],
      limit: [limit, 'p_limit'],
    },
  },
  trips_of_cylinder: {
    rpc: 'trips_of_cylinder',
    fields: { cylinder_id: [{ t: 'uuid' }, 'p_cylinder'], cursor: [cursor, 'p_cursor'], limit: [limit, 'p_limit'] },
  },
  trips_of_site: {
    rpc: 'trips_of_site',
    fields: { site_id: [{ t: 'uuid' }, 'p_site'], cursor: [cursor, 'p_cursor'], limit: [limit, 'p_limit'] },
  },
  list_eligible_cylinders: {
    rpc: 'list_eligible_cylinders',
    fields: {
      search: [search, 'p_search'],
      cylinder_type_id: [{ t: 'uuid', optional: true }, 'p_type'],
      cursor: [cursor, 'p_cursor'],
      limit: [limit, 'p_limit'],
    },
  },
};

export function createQueryTripsHandler(gateway: OperationsGateway) {
  return createOperationsHandler(gateway, QUERY_OPERATIONS, { prefix: 'trip' });
}
