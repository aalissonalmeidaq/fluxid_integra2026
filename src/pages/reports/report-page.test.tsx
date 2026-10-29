import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportService, type ReportTransport } from '@/application/reports/report-service';
import type { ReportQueryResult } from '@/domain/reports/report-catalog';
import { ReportScreen } from './report-page';

// Spec 015 (T074; US5, RF-025 a RF-028, RF-039, RF-042): relatório com critérios, geração, snapshot e totais (com a natureza do número),
// tabela paginada do mesmo recorte, filtros na URL, estado vazio sem arquivo enganoso e os estados da exportação: na fila, preparando,
// pronto, falhou e vencido. Sem `report.export`, a consulta continua e a exportação explica por que não está disponível.
const ORG = 'org-a';
const QUERY: ReportQueryResult = { ok: true, query: { type: 'proximity', filters: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-22T00:00:00.000Z' } } };
const SUMMARY = (rowCount = 2) => ({
  code: 'FOUND', report_type: 'proximity', label: 'Ocorrências de proximidade', organization: { id: ORG, display_name: 'Tenant A' },
  criteria: {}, criteria_text: 'De 2026-10-01T00:00:00.000Z até 2026-10-22T00:00:00.000Z', generated_at: '2026-10-22T15:00:00Z', snapshot_at: '2026-10-22T15:00:00Z',
  columns: [{ key: 'opened_at', label: 'Confirmada em' }, { key: 'serial_number', label: 'Cilindro' }, { key: 'close_note', label: 'Observação' }], row_count: rowCount,
  totals: [{ key: 'occurrences', value: rowCount, meaning: 'Ocorrências confirmadas', kind: 'measured' }, { key: 'positions', value: null, meaning: 'Posições', kind: 'unavailable' }],
});
const row = (id: string, serial: string) => ({ id, occurred_at: '2026-10-21T14:00:00Z', values: { opened_at: '2026-10-21T14:00:00Z', serial_number: serial, close_note: null } });
const EXPORT = (status: string, extra: Record<string, unknown> = {}) => ({ id: 'e1', report_type: 'proximity', label: 'Ocorrências de proximidade', status, row_count: 2,
  failure_code: null, requested_at: '2026-10-22T15:00:00Z', completed_at: null, expires_at: null, ...extra });

function backend(byOperation: Record<string, { status: number; body: unknown }[]>) {
  const call = vi.fn(async (_fn: string, body: Record<string, unknown>) => {
    const queue = byOperation[String(body.operation)] ?? [{ status: 500, body: {} }];
    return queue.length > 1 ? queue.shift()! : queue[0]!;
  });
  return { service: new ReportService({ call } as unknown as ReportTransport, () => true, async () => undefined), call };
}
const renderReport = (service: ReportService, extra: Partial<React.ComponentProps<typeof ReportScreen>> = {}) =>
  render(<ReportScreen service={service} organizationId={ORG} online canExport query={QUERY} onQueryChange={vi.fn()} onDownload={vi.fn()} {...extra} />);

describe('tela do relatório', () => {
  it('mostra empresa, critérios, geração, snapshot e totais com a natureza do número', async () => {
    renderReport(backend({ query_report_summary: [{ status: 200, body: SUMMARY() }], query_report_rows: [{ status: 200, body: { code: 'LISTED', rows: [row('r1', 'A-1'), row('r2', 'A-2')], next_cursor: null } }] }).service);
    expect(await screen.findByRole('heading', { level: 2, name: 'Ocorrências de proximidade' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumo do relatório' });
    expect(summary).toHaveTextContent('Tenant A');
    expect(summary).toHaveTextContent('De 2026-10-01T00:00:00.000Z até 2026-10-22T00:00:00.000Z');
    expect(summary).toHaveTextContent('Ocorrências confirmadas: 2');
    expect(summary).toHaveTextContent('Posições: indisponível');
  });

  it('tabela do mesmo recorte, com carregar mais pelo cursor', async () => {
    const { service, call } = backend({
      query_report_summary: [{ status: 200, body: SUMMARY(3) }],
      query_report_rows: [
        { status: 200, body: { code: 'LISTED', rows: [row('r1', 'A-1'), row('r2', 'A-2')], next_cursor: { at: '2026-10-21T14:00:00Z', id: 'r2' } } },
        { status: 200, body: { code: 'LISTED', rows: [row('r3', 'A-3')], next_cursor: null } },
      ],
    });
    renderReport(service);
    const table = await screen.findByRole('table', { name: 'Linhas do relatório' });
    expect(within(table).getByText('A-1')).toBeInTheDocument();
    // Tabela larga: rola dentro da própria área (com foco pelo teclado), sem rolar a página nem partir palavras.
    const region = screen.getByRole('region', { name: 'Linhas do relatório' });
    expect(region).toContainElement(table);
    expect(region).toHaveAttribute('tabindex', '0');
    expect(table).toHaveClass('tabela-de-dados--palavras-inteiras');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(await within(table).findByText('A-3')).toBeInTheDocument();
    expect(call).toHaveBeenLastCalledWith('report-export', expect.objectContaining({ operation: 'query_report_rows', snapshot_at: '2026-10-22T15:00:00Z', cursor_id: 'r2' }));
  });

  it('mudar o período atualiza a URL pela consulta canônica', async () => {
    const onQueryChange = vi.fn();
    renderReport(backend({ query_report_summary: [{ status: 200, body: SUMMARY() }], query_report_rows: [{ status: 200, body: { code: 'LISTED', rows: [], next_cursor: null } }] }).service, { onQueryChange });
    fireEvent.change(await screen.findByLabelText('Início'), { target: { value: '2026-10-10T08:00' } });
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'open' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(onQueryChange).toHaveBeenCalledWith({ type: 'proximity', filters: { from: new Date('2026-10-10T08:00').toISOString(), to: '2026-10-22T00:00:00.000Z', status: 'open' } });
  });

  it('sem registros: estado vazio claro e sem exportar arquivo enganoso', async () => {
    renderReport(backend({ query_report_summary: [{ status: 200, body: SUMMARY(0) }], query_report_rows: [{ status: 200, body: { code: 'LISTED', rows: [], next_cursor: null } }] }).service);
    expect(await screen.findByText('Nada no período escolhido')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).toBeNull();
  });

  it('exportar: na fila, preparando e pronto para baixar com o vencimento', async () => {
    const onDownload = vi.fn();
    const { service } = backend({
      query_report_summary: [{ status: 200, body: SUMMARY() }], query_report_rows: [{ status: 200, body: { code: 'LISTED', rows: [row('r1', 'A-1')], next_cursor: null } }],
      request_report_export: [{ status: 200, body: { code: 'REQUESTED', export: EXPORT('queued') } }],
      process_report_export: [{ status: 200, body: { code: 'READY', export: EXPORT('ready', { expires_at: '2026-10-23T15:00:00Z', completed_at: '2026-10-22T15:00:05Z' }) } }],
      download_report_export: [{ status: 200, body: { code: 'AUTHORIZED', url: 'https://x/arquivo.csv', expires_in: 60 } }],
    });
    renderReport(service, { onDownload });
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText(/Arquivo pronto/)).toBeInTheDocument();
    expect(screen.getByText(/Disponível até 23\/10\/2026 12:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV' }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith('https://x/arquivo.csv'));
  });

  it('exportação que falhou ou venceu explica e permite gerar de novo', async () => {
    const { service } = backend({
      query_report_summary: [{ status: 200, body: SUMMARY() }], query_report_rows: [{ status: 200, body: { code: 'LISTED', rows: [row('r1', 'A-1')], next_cursor: null } }],
      request_report_export: [{ status: 200, body: { code: 'REQUESTED', export: EXPORT('queued') } }],
      process_report_export: [{ status: 500, body: { code: 'EXPORT_FAILED' } }],
      get_report_export: [{ status: 200, body: { code: 'FOUND', export: EXPORT('failed', { failure_code: 'EXPORT_FAILED' }) } }],
    });
    renderReport(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar CSV' }));
    expect(await screen.findByText(/Não foi possível gerar o arquivo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
  });

  it('sem report.export: consulta continua e a exportação explica por quê', async () => {
    renderReport(backend({ query_report_summary: [{ status: 200, body: SUMMARY() }], query_report_rows: [{ status: 200, body: { code: 'LISTED', rows: [row('r1', 'A-1')], next_cursor: null } }] }).service,
      { canExport: false });
    expect(await screen.findByRole('table', { name: 'Linhas do relatório' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).toBeNull();
    expect(screen.getByText('Sua conta pode consultar este relatório, mas não exportar.')).toBeInTheDocument();
  });

  it('sem a leitura do tipo: acesso negado, sem dados', async () => {
    renderReport(backend({ query_report_summary: [{ status: 403, body: { code: 'ACCESS_DENIED' } }] }).service);
    expect(await screen.findByText('Sem acesso a este relatório')).toBeInTheDocument();
  });

  it('endereço inválido: explica', () => {
    renderReport(backend({}).service, { query: { ok: false, reason: 'invalid' } });
    expect(screen.getByText('Filtros inválidos')).toBeInTheDocument();
  });
});
