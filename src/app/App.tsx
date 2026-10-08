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

// Rotas da área autenticada carregadas sob demanda (RNF-003): o pacote de entrada não carrega a Visão geral nem os alertas.
// Os chunks entram no precache do service worker, então a navegação continua funcionando offline.
const OverviewPage = lazy(() => import('@/pages/overview/overview-page').then((m) => ({ default: m.OverviewPage })));
const CylinderArea = lazy(() => import('@/pages/cylinders/cylinder-area').then((m) => ({ default: m.CylinderArea })));
const RegistryArea = lazy(() => import('@/pages/registry/registry-area').then((m) => ({ default: m.RegistryArea })));
const AlertsPage = lazy(() => import('@/pages/alerts/alerts-page').then((m) => ({ default: m.AlertsPage })));

export function RouteFallback(): React.JSX.Element {
  return <Loading variant="pagina" busy label="Carregando a página…" />;
}

export function App(): React.JSX.Element {
  // Reage também à navegação interna dos formulários em modal dos cadastros; o resto do app navega por âncoras.
  useLocationKey();
  const pathname = window.location.pathname;
  const adminRoute = ADMIN_ROUTES[pathname];
  const cylinderRoute = resolveCylinderRoute(pathname);
  const registryRoute = resolveRegistryRoute(pathname);

  // O shell envolve toda rota, também o login (exibido pelo ProtectedRoute): link de pular, landmark principal
  // e o estado de conexão precisam existir para quem ainda não entrou.
  return (
    <AppShell>
      {pathname === '/recuperar-senha/confirmar' ? <RecoveryConfirmPage /> : pathname === '/perfil' ? <ProtectedRoute><ProfilePage /></ProtectedRoute> : pathname === '/alertas' ? <ProtectedRoute><Suspense fallback={<RouteFallback />}><AlertsPage /></Suspense></ProtectedRoute>   : cylinderRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><CylinderArea route={cylinderRoute} /></Suspense></TenantGate></ProtectedRoute> : registryRoute ? <ProtectedRoute><TenantGate><Suspense fallback={<RouteFallback />}><RegistryArea route={registryRoute} /></Suspense></TenantGate></ProtectedRoute> : adminRoute ? <ProtectedRoute requireAal2={adminRoute.requireAal2}>
        {adminRoute.tenantScoped ? <TenantGate><adminRoute.Page /></TenantGate> : <adminRoute.Page />}
      </ProtectedRoute> : <ProtectedRoute><Suspense fallback={<RouteFallback />}><OverviewPage /></Suspense></ProtectedRoute>}
    </AppShell>
  );
}

export default App;
