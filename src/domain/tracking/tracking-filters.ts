// Filtros canônicos do rastreamento e dos relatórios (Spec 015, contracts/consultas-relatorios-exportacoes.md). A URL é a fonte:
// só nomes do contrato, ids UUID e vocabulário fechado; nunca coordenadas ou texto livre com dado pessoal (RF-038).
import {
  FRESHNESS, POSITION_ORIGINS, TRACKING_STATUSES, isOneOf,
  type Freshness, type PositionOrigin, type TrackingCursor, type TrackingStatus,
} from './tracking-types';

export interface TrackingFilters {
  from?: string;
  to?: string;
  tripId?: string;
  vehicleId?: string;
  driverId?: string;
  cylinderId?: string;
  sealId?: string;
  status?: TrackingStatus[];
  origin?: PositionOrigin;
  quality?: Freshness;
}

export interface FilterError {
  field: string;
  message: string;
}

export type FilterParseResult = { ok: true; filters: TrackingFilters } | { ok: false; errors: FilterError[] };

// Ordem canônica dos parâmetros na URL.
const ID_PARAMS = [['trip_id', 'tripId'], ['vehicle_id', 'vehicleId'], ['driver_id', 'driverId'], ['cylinder_id', 'cylinderId'], ['seal_id', 'sealId']] as const;
const PARAM_ORDER = ['from', 'to', ...ID_PARAMS.map(([param]) => param), 'status', 'origin', 'quality'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

const isInstant = (value: string) => INSTANT.test(value) && !Number.isNaN(Date.parse(value));

export function parseTrackingFilters(params: URLSearchParams): FilterParseResult {
  const errors: FilterError[] = [];
  const filters: TrackingFilters = {};
  const seen = new Set<string>();

  for (const [name, value] of params) {
    if (!(PARAM_ORDER as readonly string[]).includes(name)) {
      errors.push({ field: name, message: 'Filtro desconhecido.' });
      continue;
    }
    if (seen.has(name)) {
      errors.push({ field: name, message: 'Filtro repetido.' });
      continue;
    }
    seen.add(name);

    if (name === 'from' || name === 'to') {
      if (isInstant(value)) filters[name] = value;
      else errors.push({ field: name, message: 'Use data e hora com fuso horário.' });
    } else if (name === 'status') {
      const values = value.split(',');
      if (values.every((item) => isOneOf(TRACKING_STATUSES, item))) filters.status = values as TrackingStatus[];
      else errors.push({ field: name, message: 'Estado inválido.' });
    } else if (name === 'origin') {
      if (isOneOf(POSITION_ORIGINS, value)) filters.origin = value;
      else errors.push({ field: name, message: 'Origem inválida.' });
    } else if (name === 'quality') {
      if (isOneOf(FRESHNESS, value)) filters.quality = value;
      else errors.push({ field: name, message: 'Condição inválida.' });
    } else {
      const key = ID_PARAMS.find(([param]) => param === name)![1];
      if (UUID.test(value)) filters[key] = value.toLowerCase();
      else errors.push({ field: name, message: 'Identificador inválido.' });
    }
  }

  if (errors.length === 0 && filters.from && filters.to && Date.parse(filters.to) <= Date.parse(filters.from)) {
    errors.push({ field: 'to', message: 'O fim do período deve ser depois do início.' });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, filters };
}

export function serializeTrackingFilters(filters: TrackingFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  for (const [param, key] of ID_PARAMS) {
    const value = filters[key];
    if (value) params.set(param, value);
  }
  if (filters.status && filters.status.length > 0) params.set('status', filters.status.join(','));
  if (filters.origin) params.set('origin', filters.origin);
  if (filters.quality) params.set('quality', filters.quality);
  return params;
}

// Cursor opaco: base64url de [instante, id]. Um cursor ilegível é ignorado e a consulta recomeça do início.
const toBase64Url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text: string) => atob(text.replace(/-/g, '+').replace(/_/g, '/'));

export function encodeTrackingCursor(cursor: TrackingCursor): string {
  return toBase64Url(JSON.stringify([cursor.occurredAt, cursor.id]));
}

export function decodeTrackingCursor(text: string): TrackingCursor | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(fromBase64Url(text));
    if (!Array.isArray(value) || value.length !== 2) return null;
    const [occurredAt, id] = value as unknown[];
    if (typeof occurredAt !== 'string' || typeof id !== 'string' || !isInstant(occurredAt) || !UUID.test(id)) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

// Consulta presa à empresa ativa (RF-036, casos extremos): ao trocar de empresa, filtros e cursor da anterior são descartados.
export interface TrackingQuery {
  organizationId: string;
  filters: TrackingFilters;
  cursor: TrackingCursor | null;
}

export function rescopeTrackingQuery(query: TrackingQuery, organizationId: string | null): TrackingQuery | null {
  if (!organizationId) return null;
  if (query.organizationId === organizationId) return query;
  return { organizationId, filters: {}, cursor: null };
}
