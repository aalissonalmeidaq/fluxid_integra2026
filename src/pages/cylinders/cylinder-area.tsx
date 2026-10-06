import React, { Suspense, lazy } from 'react';
import type { CylinderRoute } from '@/app/cylinders/cylinder-routes';
import { ErrorState, Loading } from '@/design-system';

// Cada tela de cilindros é um chunk próprio, carregado só quando a rota é aberta (RF-037); nada disso entra no pacote de entrada.
const CylinderListPage = lazy(() => import('./cylinder-list-page').then((m) => ({ default: m.CylinderListPage })));
const CylinderDetailPage = lazy(() => import('./cylinder-detail-page').then((m) => ({ default: m.CylinderDetailPage })));
const StockInPage = lazy(() => import('./stock-in-page').then((m) => ({ default: m.StockInPage })));
const CylinderFormPage = lazy(() => import('./cylinder-form-page').then((m) => ({ default: m.CylinderFormPage })));

export function CylinderArea({ route }: { route: CylinderRoute }): React.JSX.Element {
  const fallback = <Loading variant="pagina" busy label="Carregando a página…" />;
  switch (route.kind) {
    case 'list':
      return <Suspense fallback={fallback}><CylinderListPage /></Suspense>;
    case 'detail':
      return <Suspense fallback={fallback}><CylinderDetailPage cylinderId={route.id} /></Suspense>;
    case 'stock_in':
      return <Suspense fallback={fallback}><StockInPage /></Suspense>;
    case 'new':
    case 'edit':
      return <Suspense fallback={fallback}><CylinderFormPage /></Suspense>;
    default:
      return <ErrorState variant="sem-permissao" title="Página não encontrada" message="Este endereço não existe em Cilindros." />;
  }
}
