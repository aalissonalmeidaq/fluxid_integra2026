import React, { useEffect, useState } from 'react';
import type { ExportView, ReportService } from '@/application/reports/report-service';
import { Alert, Button, ErrorState, Loading } from '@/design-system';
import { formatDateTime } from '@/domain/cylinders/format';
import { AccessGate } from '@/pages/cylinders/components/access-gate';
import { toEndpointStorageUrl } from '@/infrastructure/supabase/storage-url';
import { useReportService } from './use-report-service';

// Exportação de relatório (Spec 015, US5; RF-028, RF-031): acompanhar pelo endereço um arquivo pedido antes. Só a pessoa que pediu o vê;
// pronto, mostra as linhas e o vencimento e baixa por URL curta reautorizada; falhou ou venceu, explica; parcial nunca é oferecido.
type Load = { kind: 'loading' } | { kind: 'ready'; view: ExportView } | { kind: 'not_found' } | { kind: 'error' } | { kind: 'offline' };

export interface ReportExportScreenProps {
  service: ReportService | null;
  organizationId: string;
  exportId: string;
  online: boolean;
  onDownload: (url: string) => void;
}

export function ReportExportScreen({ service, organizationId, exportId, online, onDownload }: ReportExportScreenProps): React.JSX.Element {
  const [load, setLoad] = useState<Load>(online ? { kind: 'loading' } : { kind: 'offline' });
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!online || !service || !organizationId) return undefined;
    let active = true;
    void service.status(organizationId, exportId).then(async (outcome) => {
      if (!active) return;
      if (outcome.kind !== 'success') {
        setLoad(outcome.kind === 'not_found' || outcome.kind === 'access_denied' ? { kind: 'not_found' } : outcome.kind === 'offline' ? { kind: 'offline' } : { kind: 'error' });
        return;
      }
      setLoad({ kind: 'ready', view: outcome.value });
      if (outcome.value.status === 'queued' || outcome.value.status === 'processing') {
        const followed = await service.follow(organizationId, exportId);
        if (active && followed.kind === 'success') setLoad({ kind: 'ready', view: followed.value });
      }
    });
    return () => { active = false; };
  }, [online, service, organizationId, exportId]);

  const download = async (view: ExportView) => {
    if (!service) return;
    const outcome = await service.download(organizationId, view.id, crypto.randomUUID());
    if (outcome.kind === 'success') onDownload(outcome.value.url);
    else if (outcome.kind === 'expired') setLoad({ kind: 'ready', view: { ...view, status: 'expired' } });
    else setFailure('Não foi possível baixar agora. Tente de novo.');
  };

  if (load.kind === 'loading') return <Loading variant="pagina" busy label="Carregando a exportação…" />;
  if (load.kind === 'offline') return <p className="m-0 text-corpo text-grafite">Sem conexão: a exportação aparece quando a conexão voltar.</p>;
  if (load.kind === 'not_found') return <ErrorState variant="sem-permissao" title="Exportação não encontrada" message="Este arquivo não existe, é de outra pessoa ou de outra empresa." />;
  if (load.kind === 'error') return <ErrorState title="Não foi possível carregar a exportação" message="Tente novamente em instantes." />;

  const { view } = load;
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <a className="text-corpo text-azul-profundo underline" href="/relatorios">Relatórios</a>
        <h2 className="m-0 text-h3 font-semibold text-navy">Exportação · {view.label}</h2>
        <p className="m-0 text-corpo text-grafite">Pedida em {formatDateTime(view.requestedAt)}.</p>
      </header>
      {(view.status === 'queued' || view.status === 'processing') && <p role="status" className="m-0 text-corpo text-grafite">O arquivo está sendo preparado.</p>}
      {view.status === 'ready' && (
        <>
          <p className="m-0 text-corpo text-grafite">Arquivo pronto: {view.rowCount ?? 0} linhas.{view.expiresAt ? ` Disponível até ${formatDateTime(view.expiresAt)}.` : ''}</p>
          <div><Button onClick={() => void download(view)}>Baixar CSV</Button></div>
        </>
      )}
      {view.status === 'failed' && <Alert variant="erro">Não foi possível gerar o arquivo. Nenhum arquivo parcial foi disponibilizado; gere de novo no relatório.</Alert>}
      {view.status === 'expired' && <Alert variant="alerta">O arquivo venceu. Gere de novo no relatório para baixar.</Alert>}
      {failure && <Alert variant="erro">{failure}</Alert>}
    </div>
  );
}

export function ReportExportPage({ exportId }: { exportId: string }): React.JSX.Element {
  const { service, organizationId, online, endpointUrl } = useReportService();
  return (
    <AccessGate permission="report.export">
      <ReportExportScreen key={`${organizationId}:${exportId}`} service={service} organizationId={organizationId} exportId={exportId} online={online}
        onDownload={(url) => {
          const target = endpointUrl ? toEndpointStorageUrl(url, endpointUrl) : null;
          if (target) window.location.assign(target);
        }} />
    </AccessGate>
  );
}
