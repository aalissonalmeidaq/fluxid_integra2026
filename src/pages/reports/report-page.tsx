import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExportView, ReportRow, ReportService, ReportSummaryView } from '@/application/reports/report-service';
import { usePermissions } from '@/app/navigation/permissions-context';
import { Alert, Button, Card, DataTable, EmptyState, ErrorState, Loading, type ColunaDaTabela } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { parseReportQuery, reportDefinition, serializeReportQuery, type ReportQuery, type ReportQueryResult } from '@/domain/reports/report-catalog';
import { toEndpointStorageUrl } from '@/infrastructure/supabase/storage-url';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { ReportFilters } from './report-filters';
import { useReportService } from './use-report-service';

// Relatório (Spec 015, T084; US5, RF-025 a RF-028, RF-039, RF-042). Critérios, empresa, geração, snapshot e totais (com a natureza de cada
// número) acima da tabela paginada do mesmo recorte; filtros na URL; período vazio não oferece arquivo. A exportação usa o mesmo
// snapshot e mostra o estado do job: na fila, preparando, pronto (com vencimento), falhou ou venceu. Tudo anunciado num único status.
type Load = { kind: 'loading' } | { kind: 'ready'; summary: ReportSummaryView } | { kind: 'denied' } | { kind: 'error' } | { kind: 'offline' };
type ExportState = { kind: 'idle' } | { kind: 'working'; label: string } | { kind: 'done'; view: ExportView } | { kind: 'error'; message: string };

export interface ReportScreenProps {
  service: ReportService | null;
  organizationId: string;
  online: boolean;
  canExport: boolean;
  query: ReportQueryResult;
  onQueryChange: (query: ReportQuery) => void;
  onDownload: (url: string) => void;
}

const WORDS: Record<string, string> = {
  open: 'Aberta', acknowledged: 'Reconhecida', closed: 'Encerrada', historical_only: 'Só no histórico', planned: 'Planejada', loading: 'Em carregamento',
  in_progress: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada', active: 'Ativa', paused_auth_expired: 'Pausada', live: 'Em tempo real',
  retrospective: 'Depois', android_native: 'Aplicativo Android', web_visible: 'Navegador', full: 'Completa', foreground_only: 'Só com a tela aberta',
  denied: 'Negada', unavailable: 'Indisponível', high: 'Alta', critical: 'Crítica', medium: 'Média',
};

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return value.toLocaleString('pt-BR');
  const text = String(value);
  if (key.endsWith('_at') && !Number.isNaN(Date.parse(text))) return formatDateTime(text);
  return WORDS[text] ?? text;
}

export function ReportScreen({ service, organizationId, online, canExport, query, onQueryChange, onDownload }: ReportScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [cursor, setCursor] = useState<{ at: string; id: string } | null>(null);
  const [more, setMore] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ kind: 'idle' });
  const [status, setStatus] = useState('');
  const current = query.ok ? query.query : null;

  useEffect(() => {
    if (!online || !service || !organizationId || !current) return undefined;
    let active = true;
    void (async () => {
      const summary = await service.summary(organizationId, current);
      if (!active) return;
      if (summary.kind !== 'success') {
        setLoad(summary.kind === 'access_denied' ? { kind: 'denied' } : summary.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' });
        return;
      }
      const page = await service.rows(organizationId, current, summary.value.snapshotAt, null);
      if (!active) return;
      setRows(page.kind === 'success' ? page.value.rows : []);
      setCursor(page.kind === 'success' ? page.value.nextCursor : null);
      setLoad({ kind: 'ready', summary: summary.value });
    })();
    return () => { active = false; };
  }, [online, service, organizationId, current]);

  const loadMore = useCallback(async () => {
    if (!service || !current || load.kind !== 'ready' || !cursor) return;
    setMore(true);
    const page = await service.rows(organizationId, current, load.summary.snapshotAt, cursor);
    setMore(false);
    if (page.kind === 'success') {
      setRows((previous) => [...previous, ...page.value.rows]);
      setCursor(page.value.nextCursor);
      setStatus(`${page.value.rows.length} linhas a mais carregadas.`);
    }
  }, [service, current, load, cursor, organizationId]);

  const startExport = async () => {
    if (!service || !current || load.kind !== 'ready') return;
    setExportState({ kind: 'working', label: 'Preparando o arquivo…' });
    setStatus('Preparando o arquivo.');
    const outcome = await service.export(organizationId, current, load.summary.snapshotAt, crypto.randomUUID());
    if (outcome.kind === 'success') {
      setExportState({ kind: 'done', view: outcome.value });
      setStatus(outcome.value.status === 'ready' ? 'Exportação concluída: o CSV já pode ser baixado.' : 'A exportação não foi concluída.');
      return;
    }
    setExportState({ kind: 'error', message: outcome.kind === 'access_denied' ? 'Sua conta não pode exportar este relatório.' : 'Não foi possível gerar o arquivo agora. Tente de novo.' });
  };

  const download = async (view: ExportView) => {
    if (!service) return;
    const outcome = await service.download(organizationId, view.id, crypto.randomUUID());
    if (outcome.kind === 'success') onDownload(outcome.value.url);
    else setExportState(outcome.kind === 'expired' ? { kind: 'done', view: { ...view, status: 'expired' } } : { kind: 'error', message: 'Não foi possível baixar agora. Tente de novo.' });
  };

  const columns = useMemo<ColunaDaTabela<ReportRow>[]>(() => (load.kind === 'ready' ? load.summary.columns : []).map((column, index) => ({
    id: column.key, cabecalho: column.label, ...(index === 0 ? { cabecalhoDaLinha: true } : {}),
    celula: (row: ReportRow) => formatValue(column.key, row.values[column.key]),
  })), [load]);

  if (!query.ok) {
    return <ErrorState variant="sem-permissao" title={query.reason === 'unknown_type' ? 'Relatório inexistente' : 'Filtros inválidos'}
      message="Os filtros deste endereço não são válidos para o relatório. Volte à lista de relatórios e escolha de novo." />;
  }
  const definition = reportDefinition(query.query.type);
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-1">
        <a className="text-corpo text-azul-profundo underline" href="/relatorios">Relatórios</a>
        <h2 className="m-0 text-h3 font-semibold text-navy">{definition.label}</h2>
        <p className="m-0 max-w-padrao text-corpo text-grafite">{definition.description}</p>
      </header>
      <p role="status" aria-atomic="true" className="sr-only">{status}</p>
      <ReportFilters key={serializeReportQuery(query.query).toString()} query={query.query} onApply={onQueryChange} />
      {load.kind === 'loading' && <Loading variant="pagina" busy label="Carregando o relatório…" />}
      {load.kind === 'offline' && <p className="m-0 text-corpo text-grafite">Sem conexão: o relatório aparece quando a conexão voltar.</p>}
      {load.kind === 'denied' && <ErrorState variant="sem-permissao" title="Sem acesso a este relatório" message="Sua conta não tem a permissão de leitura que este relatório exige." />}
      {load.kind === 'error' && <ErrorState title="Não foi possível carregar o relatório" message="Tente novamente em instantes." onRetry={() => setLoad({ kind: 'loading' })} />}
      {load.kind === 'ready' && (
        <>
          <Card as="section" aria-label="Resumo do relatório" className="flex flex-col gap-2">
            <dl className="m-0 grid gap-2 text-corpo text-grafite tablet:grid-cols-2">
              <div><dt className="text-legenda text-texto-secundario">Empresa</dt><dd className="m-0">{load.summary.organizationName}</dd></div>
              <div><dt className="text-legenda text-texto-secundario">Critérios</dt><dd className="m-0">{load.summary.criteriaText}</dd></div>
              <div><dt className="text-legenda text-texto-secundario">Gerado em</dt><dd className="m-0">{formatDateTime(load.summary.generatedAt)}</dd></div>
              <div><dt className="text-legenda text-texto-secundario">Dados até</dt><dd className="m-0">{formatDateTime(load.summary.snapshotAt)}</dd></div>
            </dl>
            <ul aria-label="Totais" className="m-0 flex list-none flex-wrap gap-2 p-0">
              {load.summary.totals.map((total) => (
                <li key={total.key} className="rounded-card border border-borda-suave bg-branco px-4 py-2 text-corpo text-grafite">
                  {total.meaning}: {total.value === null || total.kind === 'unavailable' ? 'indisponível' : total.value.toLocaleString('pt-BR')}
                  {total.kind === 'aggregated' ? ' (soma)' : ''}{total.kind === 'inconclusive' ? ' (inconclusivo)' : ''}
                </li>
              ))}
            </ul>
          </Card>
          {load.summary.rowCount === 0 ? (
            <EmptyState title="Nada no período escolhido" description="Revise o período ou os filtros. Sem registros, não há arquivo para exportar." />
          ) : (
            <>
              <section aria-label="Exportação" className="flex flex-col gap-2">
                {!canExport && <p className="m-0 text-corpo text-grafite">Sua conta pode consultar este relatório, mas não exportar.</p>}
                {canExport && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secundario" disabled={!online || exportState.kind === 'working'} loading={exportState.kind === 'working'} loadingLabel="Preparando o arquivo…"
                      onClick={() => void startExport()}>Exportar CSV</Button>
                    {exportState.kind === 'done' && exportState.view.status === 'ready' && (
                      <Button onClick={() => void download(exportState.view)}>Baixar CSV</Button>
                    )}
                  </div>
                )}
                {exportState.kind === 'done' && exportState.view.status === 'ready' && (
                  <p className="m-0 text-corpo text-grafite">
                    Arquivo pronto: {exportState.view.rowCount ?? 0} linhas do mesmo recorte desta tela.
                    {exportState.view.expiresAt ? ` Disponível até ${formatDateTime(exportState.view.expiresAt)}.` : ''}
                  </p>
                )}
                {exportState.kind === 'done' && exportState.view.status === 'failed' && (
                  <Alert variant="erro">Não foi possível gerar o arquivo. Nenhum arquivo parcial foi disponibilizado; tente de novo.</Alert>
                )}
                {exportState.kind === 'done' && exportState.view.status === 'expired' && (
                  <Alert variant="alerta">O arquivo venceu. Gere de novo para baixar.</Alert>
                )}
                {exportState.kind === 'done' && (exportState.view.status === 'queued' || exportState.view.status === 'processing') && (
                  <p className="m-0 text-corpo text-grafite">O arquivo ainda está sendo preparado. <a className="text-azul-profundo underline" href={`/relatorios/exportacoes/${exportState.view.id}`}>Acompanhar a exportação</a></p>
                )}
                {exportState.kind === 'error' && <Alert variant="erro">{exportState.message}</Alert>}
              </section>
              <div role="region" aria-label="Linhas do relatório" tabIndex={0} className="w-full max-w-full overflow-x-auto">
                <DataTable legenda="Linhas do relatório" colunas={columns} linhas={rows} chaveDaLinha={(row) => row.id} quebraSoEntrePalavras />
              </div>
              {cursor && <div><Button variant="secundario" loading={more} loadingLabel="Carregando…" onClick={() => void loadMore()}>Carregar mais</Button></div>}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function ReportPage({ type }: { type: string }): React.JSX.Element {
  const { service, organizationId, online, endpointUrl } = useReportService();
  const { permissions } = usePermissions();
  const [search, setSearch] = useState(() => window.location.search);
  const query = useMemo(() => parseReportQuery(type, new URLSearchParams(search)), [type, search]);
  const change = (next: ReportQuery) => {
    const params = `?${serializeReportQuery(next).toString()}`;
    window.history.pushState(null, '', `${window.location.pathname}${params}`);
    setSearch(params);
  };
  const permission = query.ok ? reportDefinition(query.query.type).permission : 'trip.read';
  return (
    <AccessGate permission={permission}>
      <ReportScreen key={`${organizationId}:${search}`} service={service} organizationId={organizationId} online={online} query={query} onQueryChange={change}
        canExport={permissions?.tenant.includes('report.export') ?? false} onDownload={(url) => {
          // O link assinado chega com a base que a Edge Function enxerga; o navegador baixa pelo destino ativo.
          const target = endpointUrl ? toEndpointStorageUrl(url, endpointUrl) : null;
          if (target) window.location.assign(target);
        }} />
    </AccessGate>
  );
}
