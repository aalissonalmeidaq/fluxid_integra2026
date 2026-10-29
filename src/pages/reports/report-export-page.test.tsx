import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReportService, type ReportTransport } from '@/application/reports/report-service';
import { ReportExportScreen } from './report-export-page';

// Spec 015 (US5; RF-028, RF-031): acompanhar uma exportação pelo endereço: pronta com vencimento e download, falha, vencida, ou não
// encontrada (de outra pessoa ou empresa).
const EXPORT = (status: string, extra: Record<string, unknown> = {}) => ({ id: 'e1', report_type: 'proximity', label: 'Ocorrências de proximidade', status,
  row_count: 3, failure_code: null, requested_at: '2026-10-22T15:00:00Z', completed_at: '2026-10-22T15:00:05Z', expires_at: '2026-10-23T15:00:00Z', ...extra });
function service(responses: { status: number; body: unknown }[]) {
  const call = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0]!));
  return { service: new ReportService({ call } as unknown as ReportTransport, () => true, async () => undefined), call };
}
const renderPage = (s: ReportService, onDownload = vi.fn()) =>
  render(<ReportExportScreen service={s} organizationId="org-a" exportId="e1" online onDownload={onDownload} />);

describe('exportação de relatório', () => {
  it('pronta: mostra linhas e vencimento e baixa pela URL curta', async () => {
    const onDownload = vi.fn();
    renderPage(service([{ status: 200, body: { code: 'FOUND', export: EXPORT('ready') } },
      { status: 200, body: { code: 'AUTHORIZED', url: 'https://x/a.csv', expires_in: 60 } }]).service, onDownload);
    expect(await screen.findByText(/3 linhas/)).toBeInTheDocument();
    expect(screen.getByText(/23\/10\/2026 12:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar CSV' }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith('https://x/a.csv'));
  });

  it('falhou e vencida: explicam, sem botão de baixar', async () => {
    renderPage(service([{ status: 200, body: { code: 'FOUND', export: EXPORT('failed', { failure_code: 'EXPORT_FAILED', expires_at: null }) } }]).service);
    expect(await screen.findByText(/Não foi possível gerar o arquivo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar CSV' })).toBeNull();
  });

  it('de outra pessoa ou empresa: não encontrada', async () => {
    renderPage(service([{ status: 404, body: { code: 'NOT_FOUND' } }]).service);
    expect(await screen.findByText('Exportação não encontrada')).toBeInTheDocument();
  });
});
