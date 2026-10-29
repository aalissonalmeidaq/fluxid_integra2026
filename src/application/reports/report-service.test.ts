import { describe, expect, it, vi } from 'vitest';
import { ReportService, type ReportTransport } from './report-service';

// Spec 015 (T070; US5, RF-024 a RF-028, RF-042): serviço dos relatórios sobre a Edge Function `report-export`. Resumo e linhas do mesmo
// snapshot; totais com a natureza (medido, agregado, indisponível, inconclusivo); pedido de exportação seguido do processamento; o job
// é acompanhado até ficar pronto, falhar ou vencer; o download devolve só a URL curta. Falhas viram estado de tela.
const ORG = 'org-a';
const QUERY = { type: 'proximity' as const, filters: { from: '2026-10-01T00:00:00Z', to: '2026-10-22T00:00:00Z' } };
const SUMMARY = {
  code: 'FOUND', report_type: 'proximity', label: 'Ocorrências de proximidade', organization: { id: ORG, display_name: 'Tenant A' },
  criteria: QUERY.filters, criteria_text: 'De … até …', generated_at: '2026-10-22T15:00:00Z', snapshot_at: '2026-10-22T15:00:00Z',
  columns: [{ key: 'serial_number', label: 'Cilindro' }], row_count: 1,
  totals: [{ key: 'occurrences', value: 1, meaning: 'Ocorrências confirmadas', kind: 'measured' }, { key: 'positions', value: null, meaning: 'Posições', kind: 'unavailable' }],
};
const EXPORT = (status: string, extra: Record<string, unknown> = {}) => ({ id: 'e1', report_type: 'proximity', label: 'Ocorrências de proximidade', status,
  row_count: 1, failure_code: null, requested_at: '2026-10-22T15:00:00Z', completed_at: null, expires_at: null, ...extra });

function transport(responses: { status: number; body: unknown }[]) {
  const call = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0]!));
  return { transport: { call } as ReportTransport, call };
}

describe('serviço de relatórios', () => {
  it('resumo: pede tipo, filtros e snapshot; traduz totais com a natureza', async () => {
    const { transport: t, call } = transport([{ status: 200, body: SUMMARY }]);
    const outcome = await new ReportService(t).summary(ORG, QUERY);
    expect(call).toHaveBeenCalledWith('report-export', { operation: 'query_report_summary', organization_id: ORG, report_type: 'proximity', filters: QUERY.filters });
    expect(outcome).toMatchObject({ kind: 'success', value: { label: 'Ocorrências de proximidade', organizationName: 'Tenant A', rowCount: 1,
      snapshotAt: '2026-10-22T15:00:00Z', totals: [{ key: 'occurrences', value: 1, kind: 'measured' }, { key: 'positions', value: null, kind: 'unavailable' }] } });
  });

  it('linhas usam o snapshot do resumo e o cursor', async () => {
    const { transport: t, call } = transport([{ status: 200, body: { code: 'LISTED', snapshot_at: 's', columns: [], rows: [{ id: 'r1', occurred_at: '2026-10-22T14:00:00Z', values: { serial_number: 'X' } }],
      next_cursor: { at: '2026-10-22T14:00:00Z', id: 'r1' } } }]);
    const outcome = await new ReportService(t).rows(ORG, QUERY, '2026-10-22T15:00:00Z', { at: '2026-10-22T13:00:00Z', id: 'r0' });
    expect(call).toHaveBeenCalledWith('report-export', expect.objectContaining({ operation: 'query_report_rows', snapshot_at: '2026-10-22T15:00:00Z',
      cursor_at: '2026-10-22T13:00:00Z', cursor_id: 'r0', limit: 50 }));
    expect(outcome).toMatchObject({ kind: 'success', value: { rows: [{ id: 'r1', values: { serial_number: 'X' } }], nextCursor: { at: '2026-10-22T14:00:00Z', id: 'r1' } } });
  });

  it('exportar: pede com o mesmo snapshot, processa e acompanha até ficar pronto', async () => {
    const { transport: t, call } = transport([
      { status: 200, body: { code: 'REQUESTED', export: EXPORT('queued') } },
      { status: 200, body: { code: 'READY', export: EXPORT('ready', { expires_at: '2026-10-23T15:00:00Z' }) } },
    ]);
    const outcome = await new ReportService(t).export(ORG, QUERY, '2026-10-22T15:00:00Z', 'req-1');
    expect(call.mock.calls[0]).toEqual(['report-export', { operation: 'request_report_export', organization_id: ORG, request_id: 'req-1', report_type: 'proximity',
      filters: QUERY.filters, snapshot_at: '2026-10-22T15:00:00Z' }]);
    expect(call.mock.calls[1]).toEqual(['report-export', { operation: 'process_report_export', organization_id: ORG, export_id: 'e1' }]);
    expect(outcome).toMatchObject({ kind: 'success', value: { id: 'e1', status: 'ready', expiresAt: '2026-10-23T15:00:00Z' } });
  });

  it('job já em processamento: acompanha o estado até terminar', async () => {
    const { transport: t } = transport([
      { status: 200, body: { code: 'ALREADY_CLAIMED', export: EXPORT('processing') } },
      { status: 200, body: { code: 'FOUND', export: EXPORT('processing') } },
      { status: 200, body: { code: 'FOUND', export: EXPORT('failed', { failure_code: 'EXPORT_FAILED' }) } },
    ]);
    const sleep = vi.fn(async () => undefined);
    const outcome = await new ReportService(t, () => true, sleep).process(ORG, 'e1');
    expect(outcome).toMatchObject({ kind: 'success', value: { status: 'failed', failureCode: 'EXPORT_FAILED' } });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('download devolve a URL curta; vencido vira estado próprio', async () => {
    const ok = transport([{ status: 200, body: { code: 'AUTHORIZED', url: 'https://x/arquivo.csv', expires_in: 60 } }]);
    expect(await new ReportService(ok.transport).download(ORG, 'e1', 'req')).toEqual({ kind: 'success', value: { url: 'https://x/arquivo.csv' } });
    const expired = transport([{ status: 410, body: { code: 'EXPORT_EXPIRED' } }]);
    expect((await new ReportService(expired.transport).download(ORG, 'e1', 'req')).kind).toBe('expired');
  });

  it.each([[403, { code: 'ACCESS_DENIED' }, 'access_denied'], [401, {}, 'session_expired'], [400, { code: 'INVALID_PERIOD' }, 'invalid'], [500, {}, 'unavailable']] as const)(
    'HTTP %i vira %s', async (status, body, kind) => {
      expect((await new ReportService(transport([{ status, body }]).transport).summary(ORG, QUERY)).kind).toBe(kind);
    });

  it('sem conexão, nem chama o servidor', async () => {
    const { transport: t, call } = transport([{ status: 200, body: SUMMARY }]);
    expect((await new ReportService(t, () => false).summary(ORG, QUERY)).kind).toBe('offline');
    expect(call).not.toHaveBeenCalled();
  });
});
