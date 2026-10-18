import React, { Suspense, lazy } from 'react';
import type { SealRoute } from '@/app/seals/seal-routes';
import { ErrorState, Loading } from '@/design-system';

// Área do lacre (Spec 012): cada tela é um chunk próprio, carregado só quando a rota é aberta; nada disso entra no pacote de entrada.
const SealListPage = lazy(() => import('./seal-list-page').then((m) => ({ default: m.SealListPage })));
const SealDetailPage = lazy(() => import('./seal-detail-page').then((m) => ({ default: m.SealDetailPage })));
const AlertsPage = lazy(() => import('@/pages/alerts/alerts-page').then((m) => ({ default: m.AlertsPage })));
const AlertDetailPage = lazy(() => import('@/pages/alerts/alert-detail-page').then((m) => ({ default: m.AlertDetailPage })));

function Page({ route }: { route: SealRoute }): React.JSX.Element {
  if (route.kind === 'seal_list') return <SealListPage />;
  if (route.kind === 'seal_detail') return <SealDetailPage deviceId={route.id} />;
  if (route.kind === 'alert_list') return <AlertsPage />;
  if (route.kind === 'alert_detail') return <AlertDetailPage alertId={route.id} />;
  return <ErrorState variant="sem-permissao" title="Página não encontrada" message="Este endereço não existe nesta área." />;
}

export function SealsArea({ route }: { route: SealRoute }): React.JSX.Element {
  return (
    <Suspense fallback={<Loading variant="pagina" busy label="Carregando a página…" />}>
      <Page route={route} />
    </Suspense>
  );
}
