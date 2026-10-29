import { json, UUID_PATTERN } from '../_shared/http.ts';
import { createOperationsHandler, type OperationSpec, type OperationsGateway, type Rule } from '../_shared/operations.ts';
import { toCsv, type CsvColumn } from './csv.ts';

export type { OperationsGateway } from '../_shared/operations.ts';

// Relatórios e exportações (Spec 015, US5; contracts/consultas-relatorios-exportacoes.md). Consultas e pedidos passam pela tabela de
// operações: ator e sessão vêm do token, filtros só com as chaves canônicas, e a matriz de permissões é decidida no banco. Processar
// gera o CSV seguro, grava num caminho temporário e só publica o arquivo completo; qualquer falha marca o job como falho e apaga o
// temporário. Baixar reautoriza no banco e devolve uma URL assinada curta. O conteúdo, o caminho e a URL nunca vão para a auditoria.
export interface ReportStorage {
  upload(path: string, content: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  signedUrl(path: string, seconds: number): Promise<string>;
}

export type ReportGateway = OperationsGateway & ReportStorage;

const TYPES = ['trips', 'telemetry_availability', 'proximity', 'alerts', 'deliveries', 'custody'] as const;
const FILTER_KEYS = ['from', 'to', 'trip_id', 'vehicle_id', 'driver_id', 'cylinder_id', 'seal_id', 'status'];
const instant: Rule = { t: 'text', max: 40, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/ };
const optionalId: Rule = { t: 'uuid', optional: true };
const filters: [Rule, string] = [{
  t: 'object',
  fields: {
    from: instant, to: instant, trip_id: optionalId, vehicle_id: optionalId, driver_id: optionalId, cylinder_id: optionalId, seal_id: optionalId,
    status: { t: 'text', max: 400, optional: true, pattern: /^[a-z_]{1,40}(,[a-z_]{1,40}){0,9}$/ },
  },
}, 'p_filters'];
const reportType: [Rule, string] = [{ t: 'enum', values: TYPES }, 'p_type'];
const snapshot: [Rule, string] = [{ ...instant, optional: true }, 'p_snapshot_at'];
const exportId: [Rule, string] = [{ t: 'uuid' }, 'p_export'];

export const REPORT_OPERATIONS: Record<string, OperationSpec> = {
  query_report_summary: { rpc: 'query_report_summary', fields: { report_type: reportType, filters, snapshot_at: snapshot } },
  query_report_rows: {
    rpc: 'query_report_rows',
    fields: {
      report_type: reportType, filters, snapshot_at: snapshot,
      cursor_at: [{ ...instant, optional: true }, 'p_cursor_at'], cursor_id: [optionalId, 'p_cursor_id'],
      limit: [{ t: 'int', min: 1, max: 200, optional: true }, 'p_limit'],
    },
  },
  request_report_export: {
    rpc: 'request_report_export', action: 'report.export_request',
    fields: { request_id: [{ t: 'uuid' }, 'p_request'], report_type: reportType, filters, snapshot_at: snapshot },
  },
  get_report_export: { rpc: 'get_report_export', fields: { export_id: exportId } },
};

const STATUS: Record<string, number> = { AUTH_REQUIRED: 401, ACCESS_DENIED: 403, NOT_FOUND: 404, EXPORT_EXPIRED: 410, INVALID_TRANSITION: 409 };
const bearer = (request: Request) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function createReportExportHandler(gateway: ReportGateway, operations: Record<string, OperationSpec> = REPORT_OPERATIONS) {
  const standard = createOperationsHandler(gateway, operations, { prefix: 'report' });

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return standard(request);
    const body = await request.clone().json().catch(() => null) as unknown;
    if (isObject(body) && isObject(body.filters) && Object.keys(body.filters).some((key) => !FILTER_KEYS.includes(key))) {
      return json({ code: 'VALIDATION_FAILED', fields: [{ field: 'filters', message: 'Filtro desconhecido.' }] }, 400);
    }
    const operation = isObject(body) ? body.operation : null;
    if (operation !== 'process_report_export' && operation !== 'download_report_export') return standard(request);

    const token = bearer(request);
    if (!token) return json({ code: 'AUTH_REQUIRED' }, 401);
    const identity = await gateway.authenticate(token).catch(() => null);
    if (!identity) return json({ code: 'AUTH_REQUIRED' }, 401);
    const organization = isObject(body) ? body.organization_id : null;
    const id = isObject(body) ? body.export_id : null;
    if (typeof organization !== 'string' || !UUID_PATTERN.test(organization) || typeof id !== 'string' || !UUID_PATTERN.test(id)) {
      return json({ code: 'VALIDATION_FAILED' }, 400);
    }
    const base = { p_actor: identity.userId, p_session: identity.sessionId, p_organization: organization, p_export: id };
    const failed = (code: string) => json({ code }, STATUS[code] ?? 500);

    if (operation === 'download_report_export') {
      const requestId = isObject(body) ? body.request_id : null;
      if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId)) return json({ code: 'VALIDATION_FAILED' }, 400);
      const authorized = await gateway.rpc('authorize_report_download', { ...base, p_request: requestId }).catch(() => null);
      if (!authorized) return json({ code: 'UNAVAILABLE' }, 500);
      if (authorized.code !== 'AUTHORIZED' || typeof authorized.storage_path !== 'string') return failed(String(authorized.code));
      const url = await gateway.signedUrl(authorized.storage_path, 60).catch(() => null);
      return url ? json({ code: 'AUTHORIZED', url, expires_in: 60 }) : json({ code: 'UNAVAILABLE' }, 500);
    }

    const claimed = await gateway.rpc('claim_report_export', base).catch(() => null);
    if (!claimed) return json({ code: 'UNAVAILABLE' }, 500);
    if (claimed.code === 'ALREADY_CLAIMED') return json({ code: 'ALREADY_CLAIMED', export: claimed.export });
    if (claimed.code !== 'CLAIMED') return failed(String(claimed.code));

    const rows = Array.isArray(claimed.rows) ? claimed.rows as Record<string, unknown>[] : [];
    const context = isObject(claimed.context) ? claimed.context : {};
    const csv = toCsv(Array.isArray(claimed.columns) ? claimed.columns as CsvColumn[] : [], rows, {
      organization: String(context.organization ?? ''), reportType: String(context.report_type ?? ''),
      generatedAt: String(context.generated_at ?? ''), criteria: String(context.criteria ?? ''),
    });
    const folder = `${organization}/${identity.userId}`;
    const temporary = `${folder}/tmp/${crypto.randomUUID()}.csv`;
    const final = `${folder}/${crypto.randomUUID()}.csv`;
    try {
      await gateway.upload(temporary, csv);
      await gateway.move(temporary, final);
    } catch {
      await gateway.remove(temporary).catch(() => undefined);
      await gateway.rpc('fail_report_export', { ...base, p_code: 'EXPORT_FAILED' }).catch(() => undefined);
      return json({ code: 'EXPORT_FAILED' }, 500);
    }
    const completed = await gateway.rpc('complete_report_export', { ...base, p_storage_path: final, p_row_count: rows.length }).catch(() => null);
    if (!completed || completed.code !== 'READY') {
      await gateway.remove(final).catch(() => undefined);
      return failed(String(completed?.code ?? 'UNAVAILABLE'));
    }
    return json({ code: 'READY', export: completed.export });
  };
}
