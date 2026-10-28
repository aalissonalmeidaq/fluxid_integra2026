// Relatórios (Spec 015, T082; US5) sobre a Edge Function `report-export`. Resumo e linhas usam o mesmo snapshot, para tela e arquivo
// terem o mesmo recorte; exportar pede o job com esse snapshot, processa e acompanha o estado até pronto, falha ou vencimento. Nada é
// guardado no aparelho e nenhuma regra de leitura é decidida aqui: o servidor aplica a matriz.
import type { ReportQuery } from '@/domain/reports/report-catalog';
import type { MeasureKind } from '@/domain/tracking/tracking-types';

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' ? value : typeof value === 'string' && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null);

export interface ReportTransport {
  call(fn: 'report-export', body: Raw): Promise<{ status: number; body: unknown }>;
}

export interface ReportColumn { key: string; label: string }
export interface ReportTotal { key: string; value: number | null; meaning: string; kind: MeasureKind }
export interface ReportSummaryView {
  label: string;
  organizationName: string;
  criteriaText: string;
  generatedAt: string;
  snapshotAt: string;
  columns: ReportColumn[];
  totals: ReportTotal[];
  rowCount: number;
}
export interface ReportRow { id: string; occurredAt: string; values: Raw }
export interface ReportPageView { rows: ReportRow[]; nextCursor: { at: string; id: string } | null }
export type ExportStatus = 'queued' | 'processing' | 'ready' | 'failed' | 'expired';
export interface ExportView {
  id: string;
  label: string;
  status: ExportStatus;
  rowCount: number | null;
  failureCode: string | null;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export type ReportFailure = 'offline' | 'unavailable' | 'unknown' | 'session_expired' | 'access_denied' | 'not_found' | 'invalid' | 'expired';
export type ReportOutcome<T> = { kind: 'success'; value: T } | { kind: ReportFailure };

const FAILURES: Record<string, ReportFailure> = {
  AUTH_REQUIRED: 'session_expired', ACCESS_DENIED: 'access_denied', NOT_FOUND: 'not_found', VALIDATION_FAILED: 'invalid', INVALID_FILTER: 'invalid',
  INVALID_PERIOD: 'invalid', EXPORT_EXPIRED: 'expired',
};
const KINDS: readonly MeasureKind[] = ['measured', 'aggregated', 'unavailable', 'inconclusive'];
const FINAL: readonly ExportStatus[] = ['ready', 'failed', 'expired'];

function toExport(raw: unknown): ExportView | null {
  if (!isObject(raw) || !str(raw.id) || !str(raw.status) || !str(raw.requested_at)) return null;
  return { id: raw.id as string, label: str(raw.label) ?? '', status: raw.status as ExportStatus, rowCount: num(raw.row_count), failureCode: str(raw.failure_code),
    requestedAt: raw.requested_at as string, completedAt: str(raw.completed_at), expiresAt: str(raw.expires_at) };
}

const columnsOf = (raw: unknown): ReportColumn[] => (Array.isArray(raw) ? raw.filter(isObject).map((c) => ({ key: str(c.key) ?? '', label: str(c.label) ?? '' })) : []);

export class ReportService {
  constructor(
    private readonly transport: ReportTransport,
    private readonly isOnline: () => boolean = () => true,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  private async run<T>(body: Raw, write: boolean, pick: (payload: Raw) => T | null): Promise<ReportOutcome<T>> {
    if (!this.isOnline()) return { kind: 'offline' };
    try {
      const response = await this.transport.call('report-export', body);
      const payload = isObject(response.body) ? response.body : {};
      if (response.status >= 200 && response.status < 300) {
        const value = pick(payload);
        return value === null ? { kind: write ? 'unknown' : 'unavailable' } : { kind: 'success', value };
      }
      if (response.status === 401) return { kind: 'session_expired' };
      const kind = typeof payload.code === 'string' ? FAILURES[payload.code] : undefined;
      return { kind: kind && response.status < 500 ? kind : write ? 'unknown' : 'unavailable' };
    } catch {
      return { kind: write ? 'unknown' : 'unavailable' };
    }
  }

  summary(organizationId: string, query: ReportQuery): Promise<ReportOutcome<ReportSummaryView>> {
    return this.run({ operation: 'query_report_summary', organization_id: organizationId, report_type: query.type, filters: query.filters }, false, (p) => {
      const generatedAt = str(p.generated_at);
      const snapshotAt = str(p.snapshot_at);
      const rowCount = num(p.row_count);
      if (p.code !== 'FOUND' || !generatedAt || !snapshotAt || rowCount === null || !Array.isArray(p.totals)) return null;
      const totals = p.totals.filter(isObject).map((t) => ({
        key: str(t.key) ?? '', value: num(t.value), meaning: str(t.meaning) ?? '',
        kind: (KINDS as readonly string[]).includes(String(t.kind)) ? t.kind as MeasureKind : 'measured',
      }));
      return { label: str(p.label) ?? '', organizationName: isObject(p.organization) ? str(p.organization.display_name) ?? '' : '', criteriaText: str(p.criteria_text) ?? '',
        generatedAt, snapshotAt, columns: columnsOf(p.columns), totals, rowCount };
    });
  }

  rows(organizationId: string, query: ReportQuery, snapshotAt: string, cursor: { at: string; id: string } | null): Promise<ReportOutcome<ReportPageView>> {
    return this.run({ operation: 'query_report_rows', organization_id: organizationId, report_type: query.type, filters: query.filters, snapshot_at: snapshotAt,
      ...(cursor ? { cursor_at: cursor.at, cursor_id: cursor.id } : {}), limit: 50 }, false, (p) => {
      if (p.code !== 'LISTED' || !Array.isArray(p.rows)) return null;
      const rows: ReportRow[] = [];
      for (const r of p.rows) {
        if (!isObject(r) || !str(r.id) || !str(r.occurred_at) || !isObject(r.values)) return null;
        rows.push({ id: r.id as string, occurredAt: r.occurred_at as string, values: r.values });
      }
      const next = isObject(p.next_cursor) && str(p.next_cursor.at) && str(p.next_cursor.id) ? { at: p.next_cursor.at as string, id: p.next_cursor.id as string } : null;
      return { rows, nextCursor: next };
    });
  }

  // Pede o job com o snapshot da tela e já o processa; se outro envio já o pegou, acompanha até terminar.
  async export(organizationId: string, query: ReportQuery, snapshotAt: string, requestId: string): Promise<ReportOutcome<ExportView>> {
    const requested = await this.run({ operation: 'request_report_export', organization_id: organizationId, request_id: requestId, report_type: query.type,
      filters: query.filters, snapshot_at: snapshotAt }, true, (p) => (p.code === 'REQUESTED' ? toExport(p.export) : null));
    if (requested.kind !== 'success') return requested;
    if (FINAL.includes(requested.value.status)) return requested;
    return this.process(organizationId, requested.value.id);
  }

  async process(organizationId: string, exportId: string): Promise<ReportOutcome<ExportView>> {
    const processed = await this.run({ operation: 'process_report_export', organization_id: organizationId, export_id: exportId }, true,
      (p) => (p.code === 'READY' || p.code === 'ALREADY_CLAIMED' ? toExport(p.export) : null));
    if (processed.kind !== 'success' || FINAL.includes(processed.value.status)) return processed;
    return this.follow(organizationId, exportId);
  }

  status(organizationId: string, exportId: string): Promise<ReportOutcome<ExportView>> {
    return this.run({ operation: 'get_report_export', organization_id: organizationId, export_id: exportId }, false, (p) => (p.code === 'FOUND' ? toExport(p.export) : null));
  }

  // Acompanha o job a cada 2 s, por até 2 minutos.
  async follow(organizationId: string, exportId: string): Promise<ReportOutcome<ExportView>> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await this.sleep(2_000);
      const current = await this.status(organizationId, exportId);
      if (current.kind !== 'success' || FINAL.includes(current.value.status)) return current;
    }
    return this.status(organizationId, exportId);
  }

  download(organizationId: string, exportId: string, requestId: string): Promise<ReportOutcome<{ url: string }>> {
    return this.run({ operation: 'download_report_export', organization_id: organizationId, export_id: exportId, request_id: requestId }, true,
      (p) => (p.code === 'AUTHORIZED' && str(p.url) ? { url: p.url as string } : null));
  }
}
