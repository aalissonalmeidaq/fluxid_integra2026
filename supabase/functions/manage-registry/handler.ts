import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Comandos dos cadastros da Fase 3 (contracts/operacoes-servidor.md): sempre auditados e atômicos no banco. NÃO existe operação
// de exclusão (RF-033): qualquer operação desconhecida é recusada e auditada como negada.
const SEGMENTS = ['hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other'] as const;
const justification: Rule = { t: 'text', max: 500 };
const optionalText = (max: number): Rule => ({ t: 'text', max, nullable: true, optional: true });
const version: [Rule, string] = [{ t: 'int', min: 1 }, 'p_expected_version'];

const contacts: Rule = {
  t: 'objects', maxItems: 10, nullable: true, optional: true,
  fields: {
    name: { t: 'text', max: 120 },
    role: optionalText(80),
    phone: optionalText(30),
    email: optionalText(200),
    is_primary: { t: 'bool', optional: true },
  },
};

const customerFields = (): Record<string, [Rule, string]> => ({
  legal_name: [{ t: 'text', max: 160 }, 'p_legal_name'],
  trade_name: [optionalText(160), 'p_trade_name'],
  segment: [{ t: 'enum', values: SEGMENTS }, 'p_segment'],
  segment_detail: [optionalText(60), 'p_segment_detail'],
  notes: [optionalText(500), 'p_notes'],
  contacts: [contacts, 'p_contacts'],
});

const siteFields = (): Record<string, [Rule, string]> => ({
  name: [{ t: 'text', max: 120 }, 'p_name'],
  postal_code: [{ t: 'text', max: 8, pattern: /^\d{8}$/ }, 'p_postal_code'],
  street: [{ t: 'text', max: 120 }, 'p_street'],
  number: [{ t: 'text', max: 20 }, 'p_number'],
  complement: [optionalText(80), 'p_complement'],
  district: [optionalText(80), 'p_district'],
  city: [{ t: 'text', max: 80 }, 'p_city'],
  state: [{ t: 'text', max: 2, pattern: /^[A-Z]{2}$/ }, 'p_state'],
  ibge_code: [{ t: 'text', max: 7, pattern: /^\d{7}$/, nullable: true, optional: true }, 'p_ibge_code'],
  latitude: [{ t: 'number', min: -90, max: 90, nullable: true, optional: true }, 'p_latitude'],
  longitude: [{ t: 'number', min: -180, max: 180, nullable: true, optional: true }, 'p_longitude'],
  receiving_contact_name: [optionalText(120), 'p_receiving_contact_name'],
  receiving_contact_phone: [{ t: 'text', max: 11, pattern: /^\d{10,11}$/, nullable: true, optional: true }, 'p_receiving_contact_phone'],
  receiving_days: [{ t: 'int-list', min: 0, max: 6, maxItems: 7, nullable: true, optional: true }, 'p_receiving_days'],
  receiving_from: [{ t: 'time', nullable: true, optional: true }, 'p_receiving_from'],
  receiving_to: [{ t: 'time', nullable: true, optional: true }, 'p_receiving_to'],
  access_instructions: [optionalText(500), 'p_access_instructions'],
  coordinates_source: [{ t: 'enum', values: ['manual', 'geocoded'], nullable: true, optional: true }, 'p_coordinates_source'],
});

const point: Rule = { t: 'object', fields: { lat: { t: 'number', min: -90, max: 90 }, lng: { t: 'number', min: -180, max: 180 } }, nullable: true, optional: true };
const geofenceFields = (): Record<string, [Rule, string]> => ({
  name: [{ t: 'text', max: 120 }, 'p_name'],
  shape: [{ t: 'enum', values: ['circle', 'polygon'] }, 'p_shape'],
  center: [point, 'p_center'],
  radius_m: [{ t: 'int', min: 1, max: 100000, nullable: true, optional: true }, 'p_radius_m'],
  vertices: [{ t: 'objects', maxItems: 200, nullable: true, optional: true, fields: { lat: { t: 'number', min: -90, max: 90 }, lng: { t: 'number', min: -180, max: 180 } } }, 'p_vertices'],
});

const vehicleFields = (): Record<string, [Rule, string]> => ({
  plate: [{ t: 'text', max: 20 }, 'p_plate'],
  vehicle_type: [{ t: 'enum', values: ['truck', 'van', 'utility', 'other'] }, 'p_vehicle_type'],
  vehicle_type_detail: [optionalText(60), 'p_vehicle_type_detail'],
  brand: [optionalText(60), 'p_brand'],
  model: [optionalText(60), 'p_model'],
  manufacture_year: [{ t: 'int', min: 1900, max: 2200, nullable: true, optional: true }, 'p_manufacture_year'],
  capacity_cylinders: [{ t: 'int', min: 1, max: 9999 }, 'p_capacity_cylinders'],
  max_load_kg: [{ t: 'number', min: 0.01, max: 9999999, nullable: true, optional: true }, 'p_max_load_kg'],
  licensing_due_on: [{ t: 'date', nullable: true, optional: true }, 'p_licensing_due_on'],
});

const driverFields = (): Record<string, [Rule, string]> => ({
  cnh_category: [{ t: 'enum', values: ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] }, 'p_cnh_category'],
  cnh_valid_until: [{ t: 'date' }, 'p_cnh_valid_until'],
  phone: [{ t: 'text', max: 20, nullable: true, optional: true }, 'p_phone'],
});

const count: Rule = { t: 'int', min: 0, max: 1000000 };
const reasoned = (target: string, arg: string): Record<string, [Rule, string]> => ({
  [target]: [{ t: 'uuid' }, arg],
  justification: [{ t: 'text', max: 500 }, 'p_justification'],
});

// Anonimização (RF-055, RF-056): exige sessão aal2 (decidido na borda e repetido no banco), motivo da lista, justificativa e confirmação. A
// confirmação passa adiante como veio: a falta dela é recusada pelo banco como CONFIRMATION_REQUIRED.
const anonymizationFields = (): Record<string, [Rule, string]> => ({
  reason: [{ t: 'enum', values: ['data_subject_request', 'retention_expired', 'other'] }, 'p_reason'],
  justification: [{ t: 'text', max: 500 }, 'p_justification'],
  confirmed: [{ t: 'bool', optional: true }, 'p_confirmed'],
});

export const MANAGE_OPERATIONS: Record<string, OperationSpec> = {
  create_customer: {
    rpc: 'create_customer', action: 'customer.create',
    fields: {
      person_type: [{ t: 'enum', values: ['legal', 'individual'] }, 'p_person_type'],
      document: [{ t: 'text', max: 40 }, 'p_document'],
      ...customerFields(),
    },
  },
  update_customer: {
    rpc: 'update_customer', action: 'customer.update',
    fields: {
      customer_id: [{ t: 'uuid' }, 'p_customer'],
      expected_version: version,
      ...customerFields(),
      document: [{ t: 'text', max: 40, nullable: true, optional: true }, 'p_document'],
      justification: [{ t: 'text', max: 500, nullable: true, optional: true }, 'p_justification'],
    },
  },
  create_site: { rpc: 'create_site', action: 'site.create', fields: { customer_id: [{ t: 'uuid' }, 'p_customer'], ...siteFields() } },
  create_geofence: { rpc: 'create_geofence', action: 'geofence.create', fields: { site_id: [{ t: 'uuid' }, 'p_site'], ...geofenceFields() } },
  update_geofence: { rpc: 'update_geofence', action: 'geofence.update', fields: { geofence_id: [{ t: 'uuid' }, 'p_geofence'], expected_version: version, ...geofenceFields() } },
  create_vehicle: { rpc: 'create_vehicle', action: 'vehicle.create', fields: vehicleFields() },
  update_vehicle: {
    rpc: 'update_vehicle', action: 'vehicle.update',
    fields: { vehicle_id: [{ t: 'uuid' }, 'p_vehicle'], expected_version: version, ...vehicleFields(), justification: [{ t: 'text', max: 500, nullable: true, optional: true }, 'p_justification'] },
  },
  change_vehicle_status: {
    rpc: 'change_vehicle_status', action: 'vehicle.status_change',
    fields: {
      vehicle_id: [{ t: 'uuid' }, 'p_vehicle'], expected_version: version, status: [{ t: 'enum', values: ['available', 'maintenance', 'inactive'] }, 'p_status'],
      justification: [{ t: 'text', max: 500, nullable: true, optional: true }, 'p_justification'],
    },
  },
  create_driver: {
    rpc: 'create_driver', action: 'driver.create',
    fields: { full_name: [{ t: 'text', max: 160 }, 'p_full_name'], cpf: [{ t: 'text', max: 20 }, 'p_cpf'], cnh_number: [{ t: 'text', max: 20 }, 'p_cnh_number'], ...driverFields() },
  },
  update_driver: {
    rpc: 'update_driver', action: 'driver.update',
    fields: {
      driver_id: [{ t: 'uuid' }, 'p_driver'], expected_version: version, full_name: [{ t: 'text', max: 160 }, 'p_full_name'], ...driverFields(),
      cpf: [{ t: 'text', max: 20, nullable: true, optional: true }, 'p_cpf'], cnh_number: [{ t: 'text', max: 20, nullable: true, optional: true }, 'p_cnh_number'],
      justification: [{ t: 'text', max: 500, nullable: true, optional: true }, 'p_justification'],
    },
  },
  link_driver_user: { rpc: 'link_driver_user', action: 'driver.user_link', fields: { driver_id: [{ t: 'uuid' }, 'p_driver'], user_id: [{ t: 'uuid' }, 'p_user'] } },
  unlink_driver_user: { rpc: 'unlink_driver_user', action: 'driver.user_unlink', fields: { driver_id: [{ t: 'uuid' }, 'p_driver'], justification: [{ t: 'text', max: 500 }, 'p_justification'] } },
  reveal_document: {
    rpc: 'reveal_document', action: 'registry.document_reveal',
    fields: { entity_type: [{ t: 'enum', values: ['customer', 'driver'] }, 'p_entity_type'], entity_id: [{ t: 'uuid' }, 'p_entity'], document: [{ t: 'enum', values: ['cpf', 'cnh'] }, 'p_document'] },
  },
  inactivate_customer: {
    rpc: 'inactivate_customer', action: 'customer.inactivate',
    fields: { ...reasoned('customer_id', 'p_customer'), expected_counts: [{ t: 'object', fields: { sites: count, geofences: count } }, 'p_expected_counts'] },
  },
  reactivate_customer: { rpc: 'reactivate_customer', action: 'customer.reactivate', fields: reasoned('customer_id', 'p_customer') },
  inactivate_site: {
    rpc: 'inactivate_site', action: 'site.inactivate',
    fields: { ...reasoned('site_id', 'p_site'), expected_counts: [{ t: 'object', fields: { geofences: count } }, 'p_expected_counts'] },
  },
  reactivate_site: { rpc: 'reactivate_site', action: 'site.reactivate', fields: reasoned('site_id', 'p_site') },
  inactivate_geofence: { rpc: 'inactivate_geofence', action: 'geofence.inactivate', fields: reasoned('geofence_id', 'p_geofence') },
  reactivate_geofence: { rpc: 'reactivate_geofence', action: 'geofence.reactivate', fields: reasoned('geofence_id', 'p_geofence') },
  inactivate_driver: { rpc: 'inactivate_driver', action: 'driver.inactivate', fields: reasoned('driver_id', 'p_driver') },
  reactivate_driver: { rpc: 'reactivate_driver', action: 'driver.reactivate', fields: reasoned('driver_id', 'p_driver') },
  anonymize_driver: {
    rpc: 'anonymize_driver', action: 'driver.anonymize', mfa: true,
    fields: { driver_id: [{ t: 'uuid' }, 'p_driver'], expected_version: version, ...anonymizationFields() },
  },
  anonymize_customer: {
    rpc: 'anonymize_customer', action: 'customer.anonymize', mfa: true,
    fields: { customer_id: [{ t: 'uuid' }, 'p_customer'], expected_version: version, ...anonymizationFields() },
  },
  anonymize_contact: { rpc: 'anonymize_contact', action: 'customer.contact_anonymize', mfa: true, fields: { contact_id: [{ t: 'uuid' }, 'p_contact'], ...anonymizationFields() } },
  update_site: { rpc: 'update_site', action: 'site.update', fields: { site_id: [{ t: 'uuid' }, 'p_site'], expected_version: version, ...siteFields() } },
};

// A justificativa de cada operação futura usa a mesma regra de tamanho (5 a 500 caracteres é conferido pelo banco).
export const JUSTIFICATION_RULE = justification;

export function createManageRegistryHandler(gateway: OperationsGateway) {
  return createOperationsHandler(gateway, MANAGE_OPERATIONS, { prefix: 'registry' });
}
