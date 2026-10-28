// Catálogo dos relatórios (Spec 015, US5; RF-024, RF-025, RF-037). A matriz de leitura é a do contrato e a mesma do servidor
// (supabase/migrations/*_report_queries.sql); `report.export` só autoriza o arquivo, nunca a leitura. A consulta vive na URL: período com
// fuso e, por tipo, só os filtros canônicos que ele usa — sem coordenadas nem texto livre.
export const REPORT_TYPES = ['trips', 'telemetry_availability', 'proximity', 'alerts', 'deliveries', 'custody'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportFilterKey = 'trip_id' | 'vehicle_id' | 'driver_id' | 'cylinder_id' | 'seal_id' | 'status';

export interface ReportDefinition {
  type: ReportType;
  label: string;
  description: string;
  permission: string;
  filters: readonly ReportFilterKey[];
}

const DEFINITIONS: Record<ReportType, ReportDefinition> = {
  trips: { type: 'trips', label: 'Viagens', permission: 'trip.read', filters: ['trip_id', 'vehicle_id', 'driver_id', 'status'],
    description: 'Viagens iniciadas ou planejadas no período, com veículo, motorista, paradas e situação.' },
  telemetry_availability: { type: 'telemetry_availability', label: 'Disponibilidade de telemetria', permission: 'tracking.read',
    filters: ['trip_id', 'vehicle_id', 'driver_id'],
    description: 'Coletas do celular do motorista por viagem: posições recebidas, recebidas depois e coletas degradadas.' },
  proximity: { type: 'proximity', label: 'Ocorrências de proximidade', permission: 'tracking.read', filters: ['trip_id', 'cylinder_id', 'seal_id', 'status'],
    description: 'Afastamentos confirmados entre o celular do motorista e o lacre, com a situação do tratamento.' },
  alerts: { type: 'alerts', label: 'Alertas', permission: 'seal.read', filters: ['cylinder_id', 'seal_id', 'status'],
    description: 'Alertas dos lacres abertos no período, por tipo, severidade e situação.' },
  deliveries: { type: 'deliveries', label: 'Entregas', permission: 'trip.read', filters: ['trip_id'],
    description: 'Entregas registradas nas paradas, com cilindros entregues, não entregues e fora da geocerca.' },
  custody: { type: 'custody', label: 'Histórico de custódia', permission: 'cylinder.history', filters: ['cylinder_id', 'trip_id'],
    description: 'Movimentações de custódia dos cilindros: entradas no estoque, saídas em viagem, entregas e devoluções.' },
};

export const reportDefinition = (type: ReportType): ReportDefinition => DEFINITIONS[type];
export const isReportType = (value: string): value is ReportType => (REPORT_TYPES as readonly string[]).includes(value);

export type ReportFilters = { from: string; to: string } & Partial<Record<ReportFilterKey, string>>;
export interface ReportQuery { type: ReportType; filters: ReportFilters }
export type ReportQueryResult = { ok: true; query: ReportQuery } | { ok: false; reason: 'unknown_type' | 'invalid' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const STATUS = /^[a-z_]{1,40}(,[a-z_]{1,40}){0,9}$/;
const MAX_RANGE_MS = 366 * 24 * 3600_000;
const ORDER: readonly ReportFilterKey[] = ['trip_id', 'vehicle_id', 'driver_id', 'cylinder_id', 'seal_id', 'status'];

export function defaultReportPeriod(now: Date): { from: string; to: string } {
  return { from: new Date(now.getTime() - 30 * 24 * 3600_000).toISOString(), to: now.toISOString() };
}

export function parseReportQuery(type: string, params: URLSearchParams, now: Date = new Date()): ReportQueryResult {
  if (!isReportType(type)) return { ok: false, reason: 'unknown_type' };
  const allowed = DEFINITIONS[type].filters as readonly string[];
  const fallback = defaultReportPeriod(now);
  const filters: ReportFilters = { from: params.get('from') ?? fallback.from, to: params.get('to') ?? fallback.to };
  for (const [key, value] of params) {
    if (key === 'from' || key === 'to') continue;
    if (!allowed.includes(key) || params.getAll(key).length > 1) return { ok: false, reason: 'invalid' };
    if (key === 'status' ? !STATUS.test(value) : !UUID.test(value)) return { ok: false, reason: 'invalid' };
    filters[key as ReportFilterKey] = key === 'status' ? value : value.toLowerCase();
  }
  const from = Date.parse(filters.from);
  const to = Date.parse(filters.to);
  if (!INSTANT.test(filters.from) || !INSTANT.test(filters.to) || Number.isNaN(from) || Number.isNaN(to) || to <= from || to - from > MAX_RANGE_MS) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, query: { type, filters } };
}

export function serializeReportQuery(query: ReportQuery): URLSearchParams {
  const params = new URLSearchParams({ from: query.filters.from, to: query.filters.to });
  for (const key of ORDER) {
    const value = query.filters[key];
    if (value) params.set(key, value);
  }
  return params;
}
