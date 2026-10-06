import {
  HYDROSTATIC_LABELS, HYDROSTATIC_STATUSES, IDENTIFIER_KINDS, IDENTIFIER_KIND_LABELS, INACTIVATION_REASONS, INACTIVATION_REASON_LABELS,
  type CylinderEventType, type HydrostaticStatus, type IdentifierKind, type InactivationReason,
} from './cylinder-types';
import { formatDate } from './format';

// Dados do fato de um evento de histórico, em frases curtas (nunca JSON bruto). Identificadores internos e valores de
// identificadores não aparecem aqui: o histórico mostra o que aconteceu, e o valor fica no cadastro do cilindro.

const CHANGE_LABELS: Record<string, string> = {
  cylinder_type_id: 'Tipo', serial_number: 'Número de série', manufacturer: 'Fabricante', manufacture_year: 'Ano de fabricação',
  working_pressure_bar: 'Pressão de trabalho', notes: 'Observações',
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const show = (value: unknown): string => (value === null || value === undefined || value === '' ? '—' : String(value));
const kindLabel = (value: unknown): string | null => (IDENTIFIER_KINDS.includes(value as IdentifierKind) ? IDENTIFIER_KIND_LABELS[value as IdentifierKind] : null);
const hydroLabel = (value: unknown): string | null => (HYDROSTATIC_STATUSES.includes(value as HydrostaticStatus) ? HYDROSTATIC_LABELS[value as HydrostaticStatus] : null);

export function describeEventData(eventType: CylinderEventType, data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const kind = kindLabel(data.kind) ?? kindLabel(data.identifier_kind);
  const hydro = hydroLabel(data.hydro_status);

  switch (eventType) {
    case 'cylinder_inactivated':
      if (INACTIVATION_REASONS.includes(data.reason as InactivationReason)) lines.push(`Motivo: ${INACTIVATION_REASON_LABELS[data.reason as InactivationReason]}`);
      if (data.was_in_stock === true) lines.push('Estava em estoque');
      break;
    case 'stock_out_inactivation':
      if (INACTIVATION_REASONS.includes(data.reason as InactivationReason)) lines.push(`Motivo: ${INACTIVATION_REASON_LABELS[data.reason as InactivationReason]}`);
      break;
    case 'cylinder_updated':
      if (isRecord(data.changes)) {
        for (const [field, change] of Object.entries(data.changes)) {
          if (isRecord(change) && field in CHANGE_LABELS) lines.push(`${CHANGE_LABELS[field]}: ${show(change.from)} → ${show(change.to)}`);
        }
      }
      break;
    case 'stock_in':
      if (kind && data.identifier_kind !== undefined) lines.push(`Tipo do identificador: ${kind}`);
      if (hydro) lines.push(`Teste: ${hydro}`);
      break;
    case 'identifier_added':
    case 'identifier_deactivated':
    case 'identifier_transferred_in':
    case 'identifier_transferred_out':
      if (kind) lines.push(`Tipo: ${kind}`);
      break;
    case 'hydrostatic_test_registered':
    case 'hydrostatic_test_rectified':
      if (data.result === 'approved') lines.push('Resultado: Aprovado');
      if (data.result === 'rejected') lines.push('Resultado: Reprovado');
      if (typeof data.performed_on === 'string') lines.push(`Realizado em ${formatDate(data.performed_on)}`);
      if (typeof data.next_due_on === 'string') lines.push(`Próxima data: ${formatDate(data.next_due_on)}`);
      if (hydro) lines.push(`Teste: ${hydro}`);
      break;
    default:
      break;
  }
  return lines;
}
