import React, { Suspense, lazy } from 'react';
import { ProtectedRoute } from './routing/protected-route';
import { RecoveryConfirmPage } from '@/pages/auth/recovery-confirm-page';
import { ProfilePage } from '@/pages/profile/profile-page';
import { Loading } from '@/design-system/components/loading';
import { TenantGate } from './tenant/tenant-gate';
import { AppShell } from './shell/app-shell';
import { ADMIN_ROUTES } from './admin-routes';
import { resolveCylinderRoute } from './cylinders/cylinder-routes';
import { useLocationKey } from './registry/registry-navigation';
import { resolveRegistryRoute } from './registry/registry-routes';
import { resolveTripRoute } from './trips/trip-routes';
import { resolveSealRoute } from './seals/seal-routes';
import { resolveTrackingRoute } from './tracking/tracking-routes';
import { resolveReportRoute } from './reports/report-routes';
import { useEffectivePath } from './use-effective-path';

// Rotas da área autenticada carregadas sob demanda (RNF-003): o pacote de entrada não carrega a Visão geral nem os alertas.
// Os chunks entram no precache do service worker, então a navegação continua funcionando offline.
const OverviewPage = lazy(() => import('@/pages/overview/overview-page').then((m) => ({ default: m.OverviewPage })));
const CylinderArea = lazy(() => import('@/pages/cylinders/cylinder-area').then((m) => ({ default: m.CylinderArea })));
const RegistryArea = lazy(() => import('@/pages/registry/registry-area').then((m) => ({ default: m.RegistryArea })));
const TripsArea = lazy(() => import('@/pages/trips/trips-area').then((m) => ({ default: m.TripsArea })));
const SyncPage = lazy(() => import('@/pages/sync/sync-page').then((m) => ({ default: m.SyncPage })));
// A landing page pública (Spec 011) é a raiz "/": carregada sob demanda e fora do shell, para não pesar o pacote de entrada.
const LandingPage = lazy(() => import('@/pages/landing/landing-page').then((m) => ({ default: m.LandingPage })));
const SealsArea = lazy(() => import('@/pages/seals/seals-area').then((m) => ({ default: m.SealsArea })));
const TrackingArea = lazy(() => import('@/pages/tracking/tracking-area').then((m) => ({ default: m.TrackingArea })));
const ReportsArea = lazy(() => import('@/pages/reports/reports-area').then((m) => ({ default: m.ReportsArea })));

export function RouteFallback(): React.JSX.Element {
  return <Loading variant="pagina" busy label="Carregando a página…" />;
}

export function App(): React.JSX.Element {
  // Reage também à navegação interna dos formulários em modal dos cadastros; o resto do app navega por âncoras.
  useLocationKey();
  const pathname = useEffectivePath();
  // A raiz é pública: sem shell, sem rota protegida e sem chamada ao servidor. A Visão geral vive em /visao-geral (desvio final).
  if (pathname === '/') return <Suspense fallback={<RouteFallback />}><LandingPage /></Suspense>;
  const adminRoute = ADMIN_ROUTES[pathname];
  const cylinderRoute = resolveCylinderRoute(pathname);
  const registryRoute = resolveRegistryRoute(pathname);
  const tripRoute = resolveTripRoute(pathname);
  const sealRoute = resolveSealRoute(pathname);
  const trackingRoute = resolveTrackingRoute(pathname);
  const reportRoute = resolveReportRoute(pathname);

  // O shell envolve toda rota, também o login (exibido pelo ProtectedRoute): link de pular, landmark principal
  // e o estado de conexão precisam existir para quem ainda não entrou.
  return (
    <AppShell>
      {pathname === '/recuperar-senha/confirmar' ? <RecoveryConfirmPage /> : pathname === '/perfil' ? <ProtectedRoute><ProfilePage /></ProtectedRoute> : pathname === '/sincronizacao' ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><SyncPage /></Suspense></TenantGate></ProtectedRoute> : reportRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><ReportsArea route={reportRoute} /></Suspense></TenantGate></ProtectedRoute> : trackingRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><TrackingArea route={trackingRoute} /></Suspense></TenantGate></ProtectedRoute> : sealRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><SealsArea route={sealRoute} /></Suspense></TenantGate></ProtectedRoute> : cylinderRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><CylinderArea route={cylinderRoute} /></Suspense></TenantGate></ProtectedRoute> : registryRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><RegistryArea route={registryRoute} /></Suspense></TenantGate></ProtectedRoute> : tripRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><TripsArea route={tripRoute} /></Suspense></TenantGate></ProtectedRoute> : adminRoute ? <ProtectedRoute>
        {adminRoute.tenantScoped ? <TenantGate><adminRoute.Page /></TenantGate> : <adminRoute.Page />}
      </ProtectedRoute> : <ProtectedRoute><Suspense fallback={<RouteFallback />}><OverviewPage /></Suspense></ProtectedRoute>}
    </AppShell>
  );
}

export default App;
