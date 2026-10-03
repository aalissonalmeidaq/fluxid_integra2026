import React from 'react';
import { ProtectedRoute } from './routing/protected-route';
import { RecoveryConfirmPage } from '@/pages/auth/recovery-confirm-page';
import { ProfilePage } from '@/pages/profile/profile-page';
import { AlertsPage } from '@/pages/alerts/alerts-page';
import { OverviewPage } from '@/pages/overview/overview-page';
import { TenantGate } from './tenant/tenant-gate';
import { AppShell } from './shell/app-shell';
import { ADMIN_ROUTES } from './admin-routes';

export function App(): React.JSX.Element {
  const pathname = window.location.pathname;
  const adminRoute = ADMIN_ROUTES[pathname];

  // O shell envolve toda rota, também o login (exibido pelo ProtectedRoute): link de pular, landmark principal
  // e o estado de conexão precisam existir para quem ainda não entrou.
  return (
    <AppShell>
      {pathname === '/recuperar-senha/confirmar' ? <RecoveryConfirmPage /> : pathname === '/perfil' ? <ProtectedRoute><ProfilePage /></ProtectedRoute> : pathname === '/alertas' ? <ProtectedRoute><AlertsPage /></ProtectedRoute> : adminRoute ? <ProtectedRoute requireAal2={adminRoute.requireAal2}>
        {adminRoute.tenantScoped ? <TenantGate><adminRoute.Page /></TenantGate> : <adminRoute.Page />}
      </ProtectedRoute> : <ProtectedRoute><OverviewPage /></ProtectedRoute>}
    </AppShell>
  );
}

export default App;
