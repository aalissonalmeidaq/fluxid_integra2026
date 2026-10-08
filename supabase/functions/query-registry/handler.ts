import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Consultas somente leitura dos cadastros da Fase 3 (contracts/operacoes-servidor.md). Sem auditoria de sucesso; negações são
// auditadas. Itens de lista nunca trazem CPF, CNH, telefone ou e-mail completos (RF-029, RF-031): isso é garantido nas RPCs.
const EVENT_TYPES = [
  'customer_created', 'customer_updated', 'customer_inactivated', 'customer_reactivated', 'contacts_changed', 'document_changed',
  'site_created', 'site_updated', 'site_inactivated', 'site_reactivated', 'geofence_created', 'geofence_updated', 'geofence_inactivated', 'geofence_reactivated',
  'vehicle_created', 'vehicle_updated', 'vehicle_status_changed', 'driver_created', 'driver_updated', 'driver_inactivated', 'driver_reactivated',
  'driver_user_linked', 'driver_user_unlinked', 'document_revealed', 'person_anonymized', 'contact_anonymized',
] as const;
const STATUSES = ['active', 'inactive', 'all'] as const;
const search: Rule = { t: 'text', max: 200, nullable: true, optional: true };
const listCommon = (): Record<string, [Rule, string]> => ({
  search: [search, 'p_search'],
  status: [{ t: 'enum', values: STATUSES, optional: true }, 'p_status'],
  cursor: [{ t: 'text', max: 400, nullable: true, optional: true }, 'p_cursor'],
  limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'],
});

export const QUERY_OPERATIONS: Record<string, OperationSpec> = {
  list_customers: {
    rpc: 'list_customers',
    fields: {
      ...listCommon(),
      segment: [{ t: 'enum', values: ['hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other'], optional: true }, 'p_segment'],
      state: [{ t: 'text', max: 2, pattern: /^[A-Z]{2}$/, optional: true }, 'p_state'],
      has_geofence: [{ t: 'bool', optional: true }, 'p_has_geofence'],
      sort: [{ t: 'enum', values: ['name', 'name_desc'], optional: true }, 'p_sort'],
    },
  },
  get_customer: { rpc: 'get_customer', fields: { customer_id: [{ t: 'uuid' }, 'p_customer'] } },
  list_sites: { rpc: 'list_sites', fields: { ...listCommon(), customer_id: [{ t: 'uuid', optional: true }, 'p_customer'] } },
  list_site_points: { rpc: 'list_site_points', fields: { limit: [{ t: 'int', min: 1, max: 1000, optional: true }, 'p_limit'] } },
  list_geofences: {
    rpc: 'list_geofences',
    fields: {
      ...listCommon(),
      site_id: [{ t: 'uuid', optional: true }, 'p_site'],
      customer_id: [{ t: 'uuid', optional: true }, 'p_customer'],
      shape: [{ t: 'enum', values: ['circle', 'polygon'], optional: true }, 'p_shape'],
    },
  },
  get_geofence: { rpc: 'get_geofence', fields: { geofence_id: [{ t: 'uuid' }, 'p_geofence'] } },
  geofences_containing_point: {
    rpc: 'geofences_containing_point',
    fields: {
      latitude: [{ t: 'number', min: -90, max: 90 }, 'p_latitude'],
      longitude: [{ t: 'number', min: -180, max: 180 }, 'p_longitude'],
      site_id: [{ t: 'uuid', optional: true }, 'p_site'],
    },
  },
  point_in_geofence: {
    rpc: 'point_in_geofence',
    fields: {
      geofence_id: [{ t: 'uuid' }, 'p_geofence'],
      latitude: [{ t: 'number', min: -90, max: 90 }, 'p_latitude'],
      longitude: [{ t: 'number', min: -180, max: 180 }, 'p_longitude'],
    },
  },
  list_vehicles: {
    rpc: 'list_vehicles',
    fields: {
      search: [search, 'p_search'],
      status: [{ t: 'enum', values: ['active', 'available', 'maintenance', 'inactive', 'all'], optional: true }, 'p_status'],
      vehicle_type: [{ t: 'enum', values: ['truck', 'van', 'utility', 'other'], optional: true }, 'p_vehicle_type'],
      licensing_status: [{ t: 'enum', values: ['em_dia', 'a_vencer', 'vencido', 'sem_data'], optional: true }, 'p_licensing_status'],
      sort: [{ t: 'enum', values: ['plate', 'plate_desc'], optional: true }, 'p_sort'],
      cursor: [{ t: 'text', max: 400, nullable: true, optional: true }, 'p_cursor'],
      limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'],
    },
  },
  get_vehicle: { rpc: 'get_vehicle', fields: { vehicle_id: [{ t: 'uuid' }, 'p_vehicle'] } },
  list_drivers: {
    rpc: 'list_drivers',
    fields: {
      ...listCommon(),
      cnh_status: [{ t: 'enum', values: ['em_dia', 'a_vencer', 'vencido', 'sem_data'], optional: true }, 'p_cnh_status'],
      linked: [{ t: 'bool', optional: true }, 'p_linked'],
      sort: [{ t: 'enum', values: ['name', 'name_desc'], optional: true }, 'p_sort'],
    },
  },
  get_driver: { rpc: 'get_driver', fields: { driver_id: [{ t: 'uuid' }, 'p_driver'] } },
  list_linkable_users: { rpc: 'list_linkable_users', fields: { search: [search, 'p_search'], limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'] } },
  preview_customer_inactivation: { rpc: 'preview_customer_inactivation', fields: { customer_id: [{ t: 'uuid' }, 'p_customer'] } },
  preview_site_inactivation: { rpc: 'preview_site_inactivation', fields: { site_id: [{ t: 'uuid' }, 'p_site'] } },
  history: {
    rpc: 'query_registry_history',
    fields: {
      entity_type: [{ t: 'enum', values: ['customer', 'site', 'geofence', 'vehicle', 'driver'] }, 'p_entity_type'],
      entity_id: [{ t: 'uuid' }, 'p_entity'],
      event_type: [{ t: 'enum', values: EVENT_TYPES, optional: true }, 'p_event_type'],
      from: [{ t: 'date', optional: true }, 'p_from'],
      to: [{ t: 'date', optional: true }, 'p_to'],
      order: [{ t: 'enum', values: ['asc', 'desc'], optional: true }, 'p_order'],
      cursor: [{ t: 'text', max: 20, nullable: true, optional: true }, 'p_cursor'],
      limit: [{ t: 'int', min: 1, max: 100, optional: true }, 'p_limit'],
    },
  },
  get_site: { rpc: 'get_site', fields: { site_id: [{ t: 'uuid' }, 'p_site'] } },
};

export function createQueryRegistryHandler(gateway: OperationsGateway) {
  return createOperationsHandler(gateway, QUERY_OPERATIONS, { prefix: 'registry' });
}
