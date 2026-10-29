import React, { Suspense, lazy } from 'react';
import type { ReportRoute } from '@/app/reports/report-routes';
import { ErrorState, Loading } from '@/design-system';

// Área dos relatórios (Spec 015): cada tela é um chunk próprio, carregado só quando a rota é aberta.
const ReportCatalogPage = lazy(() => import('./report-catalog-page').then((m) => ({ default: m.ReportCatalogPage })));
const ReportPage = lazy(() => import('./report-page').then((m) => ({ default: m.ReportPage })));
const ReportExportPage = lazy(() => import('./report-export-page').then((m) => ({ default: m.ReportExportPage })));

function Page({ route }: { route: ReportRoute }): React.JSX.Element {
  if (route.kind === 'catalog') return <ReportCatalogPage />;
  if (route.kind === 'report') return <ReportPage type={route.type} />;
  if (route.kind === 'export') return <ReportExportPage exportId={route.id} />;
  return <ErrorState variant="sem-permissao" title="Página não encontrada" message="Este endereço não existe nesta área." />;
}

export function ReportsArea({ route }: { route: ReportRoute }): React.JSX.Element {
  return (
    <Suspense fallback={<Loading variant="pagina" busy label="Carregando a página…" />}>
      <Page route={route} />
    </Suspense>
  );
}
