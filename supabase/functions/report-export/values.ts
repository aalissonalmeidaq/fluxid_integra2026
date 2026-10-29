// Valores do CSV como a pessoa lê na tela (Spec 015; validação humana de 27/10/2026). Datas e horas no horário de Brasília, no formato que
// a planilha em português reconhece como data; o fuso vai numa coluna própria. Códigos de situação, detecção, tipo, severidade, plataforma
// e evento saem por extenso, com as mesmas palavras da tela. Só colunas de código são traduzidas: texto livre fica como veio, e código
// desconhecido também, para nada sumir do arquivo.
import { ALERT_KIND_LABEL } from '../_shared/alert-kinds.ts';

export const TIME_ZONE_LABEL = 'Horário de Brasília (UTC-03:00)';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMAT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function localDateTime(text: string): string {
  if (!TIMESTAMP.test(text)) return text;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const part = Object.fromEntries(FORMAT.formatToParts(date).map((item) => [item.type, item.value]));
  return `${part.day}/${part.month}/${part.year} ${part.hour}:${part.minute}:${part.second}`;
}

const STATUS: Record<string, string> = {
  open: 'Aberta', acknowledged: 'Reconhecida', closed: 'Encerrada', historical_only: 'Só no histórico', planned: 'Planejada',
  loading: 'Em carregamento', in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada', active: 'Ativa',
  paused_auth_expired: 'Pausada',
};

const VOCABULARY: Record<string, Record<string, string>> = {
  status: STATUS,
  detection_kind: { live: 'Em tempo real', retrospective: 'Depois' },
  severity: { critical: 'Crítica', high: 'Alta', medium: 'Média' },
  platform: { android_native: 'Aplicativo Android', web_visible: 'Navegador' },
  capability: { full: 'Completa', foreground_only: 'Só com a tela aberta', denied: 'Negada', unavailable: 'Indisponível' },
  kind: ALERT_KIND_LABEL,
  event_type: {
    trip_reserved: 'Reservado para viagem', trip_released: 'Liberado da viagem', trip_departed: 'Saiu em viagem',
    trip_delivered: 'Entregue ao cliente', trip_returned: 'Devolvido ao estoque pela viagem',
  },
};

export function presentValue(key: string, value: string): string {
  if (key.endsWith('_at')) return localDateTime(value);
  if (key.endsWith('_date')) return value.replace(DATE_ONLY, '$3/$2/$1');
  return VOCABULARY[key]?.[value] ?? value;
}
