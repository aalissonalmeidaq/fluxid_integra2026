import { TRIP_EVENT_LABELS, type TripEventType } from './trip-vocabulary';

// Texto do histórico da viagem (RF-025). Usa só o que o servidor guarda no evento: contagens, posições e valores de campos de
// planejamento. O nome do recebedor nunca chega aqui (RF-032); só se há recebedor.

type Data = Record<string, unknown>;

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const isoDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
};

function created(data: Data): string {
  const date = isoDate(data.planned_date);
  const stops = count(data.stops);
  const cylinders = count(data.cylinders);
  const number = count(data.number);
  const head = number !== null ? `Viagem n.º ${number} planejada` : 'Viagem planejada';
  const parts: string[] = [];
  if (date) parts.push(`para ${date}`);
  const tail = [stops !== null ? plural(stops, 'parada', 'paradas') : null, cylinders !== null ? plural(cylinders, 'cilindro', 'cilindros') : null].filter(Boolean);
  if (tail.length > 0) parts.push(`com ${tail.join(' e ')}`);
  return `${head}${parts.length > 0 ? ' ' + parts.join(', ') : ''}.`;
}

function updated(data: Data, names: Record<string, string>): string {
  const changes = Array.isArray(data.changes) ? data.changes : [];
  const parts: string[] = [];
  for (const raw of changes) {
    if (typeof raw !== 'object' || raw === null) continue;
    const change = raw as Data;
    if (change.field === 'planned_date') parts.push(`Data prevista: ${isoDate(change.old) ?? '—'} → ${isoDate(change.new) ?? '—'}`);
    else if (change.field === 'vehicle_id' || change.field === 'driver_id') {
      const label = change.field === 'vehicle_id' ? 'Veículo' : 'Motorista';
      const before = typeof change.old === 'string' ? names[change.old] : undefined;
      const after = typeof change.new === 'string' ? names[change.new] : undefined;
      parts.push(before && after ? `${label}: ${before} → ${after}` : `${label} alterado`);
    } else if (change.field === 'notes_changed') parts.push('Observações alteradas');
  }
  const added = count(data.added);
  const released = count(data.released);
  if (added) parts.push(plural(added, 'cilindro adicionado', 'cilindros adicionados'));
  if (released) parts.push(plural(released, 'cilindro liberado', 'cilindros liberados'));
  return parts.length > 0 ? `${parts.join('; ')}.` : 'Viagem editada.';
}

function delivery(data: Data, corrected: boolean): string {
  const position = count(data.position);
  const delivered = count(data.delivered);
  const notDelivered = count(data.not_delivered);
  if (position === null || delivered === null || notDelivered === null) return corrected ? 'Entrega corrigida.' : 'Entrega registrada.';
  const results = `${plural(delivered, 'entregue', 'entregues')} e ${plural(notDelivered, 'não entregue', 'não entregues')}`;
  const recipient = data.has_recipient === true ? ', com recebedor registrado' : '';
  const outside = data.outside_geofence === true ? ' Registrada fora da área da unidade.' : '';
  return corrected ? `Parada ${position} corrigida: ${results}${recipient}.${outside}` : `Parada ${position}: ${results}${recipient}.${outside}`;
}

function completed(data: Data): string {
  const delivered = count(data.delivered);
  const returned = count(data.returned);
  if (delivered === null || returned === null) return 'Viagem concluída.';
  return `Viagem concluída: ${plural(delivered, 'cilindro entregue', 'cilindros entregues')} e ${plural(returned, 'devolvido', 'devolvidos')} ao estoque.`;
}

function cancelled(data: Data): string {
  const inTransit = count(data.in_transit) ?? 0;
  const released = count(data.released) ?? 0;
  const base = data.from === 'in_progress' ? 'Viagem cancelada em andamento' : 'Viagem cancelada';
  if (inTransit > 0) return `${base}; ${plural(inTransit, 'cilindro continua', 'cilindros continuam')} em trânsito.`;
  if (released > 0) return `${base}; ${plural(released, 'cilindro liberado', 'cilindros liberados')}.`;
  return `${base}.`;
}

/**
 * Descreve um evento do histórico em uma frase. `names` traduz ids de veículo e motorista para o texto exibido; sem ele a edição
 * diz só que o campo mudou.
 */
export function describeTripEvent(type: TripEventType, data: Data, names: Record<string, string> = {}): string {
  switch (type) {
    case 'trip_created': return created(data);
    case 'trip_updated': return updated(data, names);
    case 'stop_arrived': {
      const position = count(data.position);
      if (position === null) return `${TRIP_EVENT_LABELS.stop_arrived}.`;
      return `Chegada à parada ${position}${data.out_of_order === true ? ', fora da ordem planejada' : ''}.`;
    }
    case 'delivery_registered': return delivery(data, false);
    case 'delivery_corrected': return delivery(data, true);
    case 'unlock_registered': return data.exceptional === true ? 'Desbloqueio excepcional registrado.' : 'Desbloqueio registrado.';
    case 'trip_completed': return completed(data);
    case 'trip_cancelled': return cancelled(data);
    default: return `${TRIP_EVENT_LABELS[type]}.`;
  }
}
