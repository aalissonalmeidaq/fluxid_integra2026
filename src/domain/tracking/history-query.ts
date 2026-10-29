// Consulta do histórico na URL (Spec 015, US3; RF-021): assunto (viagem ou cilindro), id e período com fuso. Sem coordenadas nem texto
// livre; período de até 31 dias, como no servidor. Sem período, as 12 horas até agora.
export type HistorySubject = 'trip' | 'cylinder';

export interface HistoryQuery {
  subject: HistorySubject;
  subjectId: string;
  from: string;
  to: string;
}

export type HistoryQueryResult = { ok: true; query: HistoryQuery } | { ok: false; reason: 'missing_subject' | 'invalid' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const ALLOWED = ['subject', 'id', 'from', 'to'];
const MAX_RANGE_MS = 31 * 24 * 3600_000;
const DEFAULT_RANGE_MS = 12 * 3600_000;

export function defaultHistoryPeriod(now: Date): { from: string; to: string } {
  return { from: new Date(now.getTime() - DEFAULT_RANGE_MS).toISOString(), to: now.toISOString() };
}

const isInstant = (value: string) => INSTANT.test(value) && !Number.isNaN(Date.parse(value));

export function parseHistoryQuery(params: URLSearchParams, now: Date = new Date()): HistoryQueryResult {
  if (!params.has('subject') && !params.has('id')) return { ok: false, reason: 'missing_subject' };
  for (const key of params.keys()) if (!ALLOWED.includes(key) || params.getAll(key).length > 1) return { ok: false, reason: 'invalid' };
  const subject = params.get('subject');
  const subjectId = params.get('id') ?? '';
  if ((subject !== 'trip' && subject !== 'cylinder') || !UUID.test(subjectId)) return { ok: false, reason: 'invalid' };
  const fallback = defaultHistoryPeriod(now);
  const from = params.get('from') ?? fallback.from;
  const to = params.get('to') ?? fallback.to;
  if (!isInstant(from) || !isInstant(to)) return { ok: false, reason: 'invalid' };
  const range = Date.parse(to) - Date.parse(from);
  if (range <= 0 || range > MAX_RANGE_MS) return { ok: false, reason: 'invalid' };
  return { ok: true, query: { subject, subjectId: subjectId.toLowerCase(), from, to } };
}

export function serializeHistoryQuery(query: HistoryQuery): URLSearchParams {
  return new URLSearchParams({ subject: query.subject, id: query.subjectId, from: query.from, to: query.to });
}
