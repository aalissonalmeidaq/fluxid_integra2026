import type { ValidityStatus } from '../shared/validity-status';

// Vocabulário dos cadastros da Fase 3 (data-model.md). O banco tem as mesmas listas nas restrições de
// supabase/migrations/*registry_schema.sql; registry-vocabulary.test.ts reprova divergência.

export const PERSON_TYPES = ['legal', 'individual'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];
export const PERSON_TYPE_LABELS: Record<PersonType, string> = { legal: 'Pessoa jurídica', individual: 'Pessoa física' };

export const SEGMENTS = ['hospital', 'clinic', 'laboratory', 'industry', 'distributor', 'other'] as const;
export type Segment = (typeof SEGMENTS)[number];
export const SEGMENT_LABELS: Record<Segment, string> = {
  hospital: 'Hospital', clinic: 'Clínica', laboratory: 'Laboratório', industry: 'Indústria', distributor: 'Distribuidor', other: 'Outro',
};

export const ENTITY_STATUSES = ['active', 'inactive'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];
export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = { active: 'Ativo', inactive: 'Inativo' };

export const VEHICLE_TYPES = ['truck', 'van', 'utility', 'other'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = { truck: 'Caminhão', van: 'Van', utility: 'Utilitário', other: 'Outro' };

export const VEHICLE_STATUSES = ['available', 'maintenance', 'inactive'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = { available: 'Disponível', maintenance: 'Em manutenção', inactive: 'Inativo' };

export const CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;
export type CnhCategory = (typeof CNH_CATEGORIES)[number];

export const GEOFENCE_SHAPES = ['circle', 'polygon'] as const;
export type GeofenceShape = (typeof GEOFENCE_SHAPES)[number];
export const GEOFENCE_SHAPE_LABELS: Record<GeofenceShape, string> = { circle: 'Círculo', polygon: 'Polígono' };

export const DOCUMENT_KINDS = ['cnpj', 'cpf'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export type Uf = (typeof UFS)[number];

// Dias da semana de recebimento: 0 (domingo) a 6 (sábado).
export const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const WEEK_DAY_LABELS: readonly string[] = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const ENTITY_TYPES = ['customer', 'site', 'geofence', 'vehicle', 'driver'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const EVENT_TYPES = [
  'customer_created', 'customer_updated', 'customer_inactivated', 'customer_reactivated', 'contacts_changed', 'document_changed',
  'site_created', 'site_updated', 'site_inactivated', 'site_reactivated',
  'geofence_created', 'geofence_updated', 'geofence_inactivated', 'geofence_reactivated',
  'vehicle_created', 'vehicle_updated', 'vehicle_status_changed',
  'driver_created', 'driver_updated', 'driver_inactivated', 'driver_reactivated', 'driver_user_linked', 'driver_user_unlinked',
  'document_revealed', 'person_anonymized', 'contact_anonymized',
] as const;
export type RegistryEventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS: Record<RegistryEventType, string> = {
  customer_created: 'Cliente cadastrado', customer_updated: 'Cliente alterado', customer_inactivated: 'Cliente inativado',
  customer_reactivated: 'Cliente reativado', contacts_changed: 'Contatos alterados', document_changed: 'Documento alterado',
  site_created: 'Unidade cadastrada', site_updated: 'Unidade alterada', site_inactivated: 'Unidade inativada', site_reactivated: 'Unidade reativada',
  geofence_created: 'Geocerca cadastrada', geofence_updated: 'Geocerca alterada', geofence_inactivated: 'Geocerca inativada',
  geofence_reactivated: 'Geocerca reativada',
  vehicle_created: 'Veículo cadastrado', vehicle_updated: 'Veículo alterado', vehicle_status_changed: 'Situação do veículo alterada',
  driver_created: 'Motorista cadastrado', driver_updated: 'Motorista alterado', driver_inactivated: 'Motorista inativado',
  driver_reactivated: 'Motorista reativado', driver_user_linked: 'Usuário vinculado', driver_user_unlinked: 'Usuário desvinculado',
  document_revealed: 'Documento revelado', person_anonymized: 'Dados pessoais anonimizados', contact_anonymized: 'Contato anonimizado',
};

export const ANONYMIZATION_REASONS = ['data_subject_request', 'retention_expired', 'other'] as const;
export type AnonymizationReason = (typeof ANONYMIZATION_REASONS)[number];
export const ANONYMIZATION_REASON_LABELS: Record<AnonymizationReason, string> = {
  data_subject_request: 'Solicitação do titular', retention_expired: 'Fim do prazo de retenção', other: 'Outro motivo',
};

// Situação de documento com validade (licenciamento do veículo e CNH), sempre com texto, nunca só cor.
export const VALIDITY_LABELS: Record<ValidityStatus, string> = { em_dia: 'Em dia', a_vencer: 'A vencer', vencido: 'Vencido', sem_data: 'Sem data' };

export const JUSTIFICATION_MIN = 5;
export const JUSTIFICATION_MAX = 500;
export const MAX_CONTACTS = 10;
