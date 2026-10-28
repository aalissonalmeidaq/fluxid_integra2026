import { toCsv } from '../../../supabase/functions/report-export/csv';
import { fail, ORG_A, type Can, type Json, type Reply } from './mock-registry';

// Backend simulado da Edge Function report-export (Spec 015, US5) para os E2E. Reproduz o contrato em memória: matriz de leitura por
// tipo, `report.export` só para o arquivo, job por solicitante e o CSV gerado pelo mesmo serializador do servidor. As regras de verdade
// são provadas no pgTAP 015_reports.
// Mesmo formato do link assinado real do Storage: o aplicativo só segue caminhos de objeto assinado (storage-url.ts).
export const REPORT_DOWNLOAD_PATH = '/storage/v1/object/sign/report-exports/';

const PERMISSION: Record<string, string> = {
  trips: 'trip.read', deliveries: 'trip.read', telemetry_availability: 'tracking.read', proximity: 'tracking.read', alerts: 'seal.read', custody: 'cylinder.history',
};
const LABEL: Record<string, string> = {
  trips: 'Viagens', telemetry_availability: 'Disponibilidade de telemetria', proximity: 'Ocorrências de proximidade', alerts: 'Alertas',
  deliveries: 'Entregas', custody: 'Histórico de custódia',
};
const COLUMNS: Record<string, { key: string; label: string }[]> = {
  trips: [{ key: 'trip_number', label: 'Viagem' }, { key: 'status', label: 'Situação' }],
  telemetry_availability: [{ key: 'trip_number', label: 'Viagem' }, { key: 'positions', label: 'Posições recebidas' }],
  proximity: [{ key: 'serial_number', label: 'Cilindro' }, { key: 'close_note', label: 'Observação' }],
  alerts: [{ key: 'kind', label: 'Tipo' }, { key: 'severity', label: 'Severidade' }],
  deliveries: [{ key: 'trip_number', label: 'Viagem' }, { key: 'delivered_items', label: 'Cilindros entregues' }],
  custody: [{ key: 'serial_number', label: 'Cilindro' }, { key: 'event_type', label: 'Evento' }],
};
const ROWS: Record<string, Json[]> = {
  trips: [{ trip_number: 9161, status: 'in_progress' }, { trip_number: 9162, status: 'completed' }],
  telemetry_availability: [{ trip_number: 9161, positions: 42 }],
  // Uma observação que viraria fórmula numa planilha: o arquivo deve neutralizá-la.
  proximity: [{ serial_number: 'TRK-A-1', close_note: '=HYPERLINK("http://x")' }, { serial_number: 'TRK-A-2', close_note: 'Carga conferida.' }],
  alerts: [{ kind: 'proximity_separation', severity: 'high' }],
  deliveries: [{ trip_number: 9162, delivered_items: 3 }],
  custody: [{ serial_number: 'TRK-A-1', event_type: 'trip_departed' }],
};

export class ReportMock {
  readonly exports = new Map<string, { id: string; type: string; status: string; csv: string; rows: number }>();
  now: () => Date = () => new Date();
  private counter = 0;

  csvOf(id: string): string | null {
    return this.exports.get(id)?.csv ?? null;
  }

  handle(body: Json, can: Can): Reply {
    const org = typeof body.organization_id === 'string' ? body.organization_id : '';
    if (org !== ORG_A) return fail('NOT_FOUND', 404);
    const generated = this.now().toISOString();
    const type = typeof body.report_type === 'string' ? body.report_type : '';
    const operation = body.operation;
    if (operation === 'get_report_export' || operation === 'process_report_export' || operation === 'download_report_export') {
      const job = this.exports.get(String(body.export_id));
      if (!job) return fail('NOT_FOUND', 404);
      if (!can(org, 'report.export') || !can(org, PERMISSION[job.type]!)) return fail('ACCESS_DENIED', 403);
      if (operation === 'download_report_export') {
        return { status: 200, json: { code: 'AUTHORIZED', url: `http://127.0.0.1:54321${REPORT_DOWNLOAD_PATH}${job.id}.csv`, expires_in: 60 } };
      }
      job.status = 'ready';
      return { status: 200, json: { code: operation === 'get_report_export' ? 'FOUND' : 'READY', export: this.view(job) } };
    }
    if (!PERMISSION[type]) return fail('VALIDATION_FAILED', 400);
    if (!can(org, PERMISSION[type]!)) return fail('ACCESS_DENIED', 403);
    const rows = ROWS[type] ?? [];
    if (operation === 'query_report_summary') {
      return { status: 200, json: { code: 'FOUND', report_type: type, label: LABEL[type], organization: { id: org, display_name: 'Tenant A' }, criteria: body.filters,
        criteria_text: `De ${String((body.filters as Json)?.from)} até ${String((body.filters as Json)?.to)}`, generated_at: generated, snapshot_at: generated,
        columns: COLUMNS[type], row_count: rows.length, totals: [{ key: 'rows', value: rows.length, meaning: 'Registros no período', kind: 'measured' }] } };
    }
    if (operation === 'query_report_rows') {
      return { status: 200, json: { code: 'LISTED', snapshot_at: generated, columns: COLUMNS[type],
        rows: rows.map((values, index) => ({ id: `${type}-${index}`, occurred_at: generated, values })), next_cursor: null } };
    }
    if (operation === 'request_report_export') {
      if (!can(org, 'report.export')) return fail('ACCESS_DENIED', 403);
      this.counter += 1;
      const id = `a17d0000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
      const csv = toCsv(COLUMNS[type]!, rows, { organization: 'Tenant A', reportType: LABEL[type]!, generatedAt: generated, criteria: 'Período escolhido' });
      const job = { id, type, status: 'queued', csv, rows: rows.length };
      this.exports.set(id, job);
      return { status: 200, json: { code: 'REQUESTED', export: this.view(job) } };
    }
    return fail('VALIDATION_FAILED', 400);
  }

  private view(job: { id: string; type: string; status: string; rows: number }): Json {
    const now = this.now();
    return { id: job.id, report_type: job.type, label: LABEL[job.type], status: job.status, row_count: job.rows, failure_code: null,
      requested_at: now.toISOString(), completed_at: job.status === 'ready' ? now.toISOString() : null,
      expires_at: job.status === 'ready' ? new Date(now.getTime() + 24 * 3600_000).toISOString() : null };
  }
}

export const createReportMock = (): ReportMock => new ReportMock();
