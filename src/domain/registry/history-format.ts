import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS, SEGMENT_LABELS, type Segment, type VehicleStatus, type VehicleType } from './registry-vocabulary';

// Texto do histórico dos cadastros (RF-036, RF-037). Os eventos já chegam sem dado pessoal: campos pessoais vêm só pelo nome em
// `changed_sensitive`, e aqui nunca se mostra valor para eles. Este arquivo só traduz o que o servidor devolveu.

const FIELD_LABELS: Record<string, string> = {
  legal_name: 'Nome ou razão social', trade_name: 'Nome fantasia', notes: 'Observações', segment: 'Segmento', segment_detail: 'Detalhe do segmento',
  full_name: 'Nome', phone: 'Telefone', email: 'E-mail', contacts: 'Contatos', plate: 'Placa', vehicle_type: 'Tipo', vehicle_type_detail: 'Detalhe do tipo', brand: 'Marca',
  model: 'Modelo', manufacture_year: 'Ano de fabricação', capacity_cylinders: 'Capacidade em cilindros', max_load_kg: 'Carga máxima (kg)', licensing_due_on: 'Vencimento do licenciamento',
  cnh_category: 'Categoria da CNH', cnh_valid_until: 'Validade da CNH', name: 'Nome', street: 'Logradouro', number: 'Número', city: 'Cidade', state: 'UF',
  postal_code: 'CEP', district: 'Bairro', complement: 'Complemento',
};

const label = (field: string): string => FIELD_LABELS[field] ?? field;

const VEHICLE_STATUS: Record<string, string> = VEHICLE_STATUS_LABELS;
const VEHICLE_TYPES: Record<string, string> = VEHICLE_TYPE_LABELS;
const SEGMENTS: Record<string, string> = SEGMENT_LABELS;

function display(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '(vazio)';
  if (field === 'vehicle_type' && typeof value === 'string') return VEHICLE_TYPES[value as VehicleType] ?? value;
  if (field === 'segment' && typeof value === 'string') return SEGMENTS[value as Segment] ?? value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  return String(value);
}

const asRecord = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

// Linhas de descrição de um evento, na ordem em que aparecem na tela.
export function describeRegistryEvent(eventType: string, data: Record<string, unknown>): string[] {
  const lines: string[] = [];
  if (Array.isArray(data.changes)) {
    for (const change of data.changes) {
      const entry = asRecord(change);
      const field = typeof entry.field === 'string' ? entry.field : '';
      if (field !== '') lines.push(`${label(field)}: ${display(field, entry.old)} → ${display(field, entry.new)}`);
    }
  }
  if (Array.isArray(data.changed_sensitive) && data.changed_sensitive.length > 0) {
    const names = data.changed_sensitive.filter((name): name is string => typeof name === 'string').map(label).join(', ');
    lines.push(`Campos pessoais alterados (valores não exibidos): ${names}`);
  }
  if (typeof data.from === 'string' && typeof data.to === 'string' && eventType === 'vehicle_status_changed') {
    lines.push(`Situação: ${VEHICLE_STATUS[data.from as VehicleStatus] ?? data.from} → ${VEHICLE_STATUS[data.to as VehicleStatus] ?? data.to}`);
  }
  if (eventType === 'geofence_updated' && typeof data.name_from === 'string' && data.name_from !== data.name_to) lines.push(`Nome: ${String(data.name_from)} → ${String(data.name_to)}`);
  if (eventType === 'geofence_updated' || eventType === 'geofence_created') {
    const to = asRecord(data.to ?? data);
    const from = asRecord(data.from);
    if (typeof from.shape === 'string' && typeof to.shape === 'string' && from.shape !== to.shape) lines.push(`Forma: ${from.shape === 'circle' ? 'círculo' : 'polígono'} → ${to.shape === 'circle' ? 'círculo' : 'polígono'}`);
    else if (typeof to.radius_m === 'number' && typeof from.radius_m === 'number' && from.radius_m !== to.radius_m) lines.push(`Raio: ${from.radius_m} m → ${to.radius_m} m`);
    else if (eventType === 'geofence_updated') lines.push('Forma ou posição alterada');
  }
  if (typeof data.cascade_of === 'string') lines.push('Inativado junto com o cadastro de origem');
  if (eventType === 'customer_inactivated' && (typeof data.sites === 'number' || typeof data.geofences === 'number')) {
    lines.push(`Inativadas junto: ${Number(data.sites ?? 0)} unidade(s) e ${Number(data.geofences ?? 0)} geocerca(s)`);
  }
  if (eventType === 'site_inactivated' && typeof data.geofences === 'number') lines.push(`Inativadas junto: ${data.geofences} geocerca(s)`);
  if (eventType === 'contacts_changed' && typeof data.count === 'number') lines.push(`Contatos informados: ${data.count}`);
  if (eventType === 'document_changed' && typeof data.kind === 'string') lines.push(`Documento alterado: ${data.kind.toUpperCase()} (valor não exibido)`);
  if (eventType === 'document_revealed' && typeof data.document === 'string') lines.push(`Documento revelado: ${data.document.toUpperCase()} (valor não exibido)`);
  if (eventType === 'person_anonymized' || eventType === 'contact_anonymized') {
    if (Array.isArray(data.fields) && data.fields.length > 0) lines.push(`Campos anonimizados: ${data.fields.filter((name): name is string => typeof name === 'string').map(label).join(', ')}`);
    if (typeof data.reason === 'string') lines.push(`Motivo: ${data.reason}`);
  }
  return lines;
}
