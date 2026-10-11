// Vocabulário do domínio de cilindros (Spec 006). Os valores em inglês são os do banco; os rótulos em português vão para a tela.
// Situação cadastral, de estoque e do teste são estados independentes (Constituição, princípio IV; RF-018).

export const CYLINDER_STATUSES = ['active', 'inactive'] as const;
export type CylinderStatus = (typeof CYLINDER_STATUSES)[number];

export const STOCK_STATUSES = ['in_stock', 'out_of_stock'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const HYDROSTATIC_STATUSES = ['em_dia', 'a_vencer', 'vencido', 'reprovado', 'sem_teste'] as const;
export type HydrostaticStatus = (typeof HYDROSTATIC_STATUSES)[number];

export const HYDROSTATIC_RESULTS = ['approved', 'rejected'] as const;
export type HydrostaticResult = (typeof HYDROSTATIC_RESULTS)[number];

export const INACTIVATION_REASONS = ['written_off', 'lost', 'condemned', 'other'] as const;
export type InactivationReason = (typeof INACTIVATION_REASONS)[number];

export const IDENTIFIER_KINDS = ['qr_code', 'data_matrix', 'nfc_tag', 'hull_number'] as const;
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];

export const IDENTIFIER_STATUSES = ['active', 'deactivated'] as const;
export type IdentifierStatus = (typeof IDENTIFIER_STATUSES)[number];

export const CAPACITY_UNITS = ['l', 'm3', 'kg'] as const;
export type CapacityUnit = (typeof CAPACITY_UNITS)[number];

export const CLASSIFICATIONS = ['medicinal', 'industrial'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const EVENT_TYPES = [
  'cylinder_created', 'cylinder_updated', 'cylinder_inactivated', 'cylinder_reactivated',
  'identifier_added', 'identifier_deactivated', 'identifier_transferred_out', 'identifier_transferred_in',
  'stock_in', 'stock_out_inactivation', 'hydrostatic_test_registered', 'hydrostatic_test_rectified',
  'trip_reserved', 'trip_released', 'trip_departed', 'trip_delivered', 'trip_returned',
] as const;
export type CylinderEventType = (typeof EVENT_TYPES)[number];

export const STATUS_LABELS: Record<CylinderStatus, string> = { active: 'Ativo', inactive: 'Inativo' };
export const STOCK_LABELS: Record<StockStatus, string> = { in_stock: 'Em estoque', out_of_stock: 'Fora do estoque' };
export const HYDROSTATIC_LABELS: Record<HydrostaticStatus, string> = {
  em_dia: 'Em dia', a_vencer: 'A vencer', vencido: 'Vencido', reprovado: 'Reprovado', sem_teste: 'Sem teste',
};
export const INACTIVATION_REASON_LABELS: Record<InactivationReason, string> = {
  written_off: 'Baixado', lost: 'Perdido', condemned: 'Condenado', other: 'Outro motivo',
};
export const IDENTIFIER_KIND_LABELS: Record<IdentifierKind, string> = {
  qr_code: 'QR Code', data_matrix: 'Data Matrix', nfc_tag: 'Etiqueta NFC', hull_number: 'Número do casco',
};
export const CAPACITY_UNIT_LABELS: Record<CapacityUnit, string> = { l: 'L', m3: 'm³', kg: 'kg' };
export const CLASSIFICATION_LABELS: Record<Classification, string> = { medicinal: 'Medicinal', industrial: 'Industrial' };
export const EVENT_LABELS: Record<CylinderEventType, string> = {
  cylinder_created: 'Cilindro cadastrado',
  cylinder_updated: 'Dados editados',
  cylinder_inactivated: 'Cilindro inativado',
  cylinder_reactivated: 'Cilindro reativado',
  identifier_added: 'Identificador acrescentado',
  identifier_deactivated: 'Identificador desativado',
  identifier_transferred_out: 'Identificador transferido (saída)',
  identifier_transferred_in: 'Identificador transferido (entrada)',
  stock_in: 'Entrada no estoque',
  stock_out_inactivation: 'Saída do estoque por inativação',
  hydrostatic_test_registered: 'Teste hidrostático registrado',
  hydrostatic_test_rectified: 'Teste hidrostático retificado',
  trip_reserved: 'Reservado para viagem',
  trip_released: 'Liberado da viagem',
  trip_departed: 'Saiu em viagem',
  trip_delivered: 'Entregue ao cliente',
  trip_returned: 'Devolvido ao estoque pela viagem',
};

export const JUSTIFICATION_MIN = 5;
export const JUSTIFICATION_MAX = 500;
