import React from 'react';
import { ProtectedRoute } from './routing/protected-route';
import { RecoveryConfirmPage } from '@/pages/auth/recovery-confirm-page';
import { ProfilePage } from '@/pages/profile/profile-page';
import { Card } from '@/design-system/components/card';
import { TenantGate } from './tenant/tenant-gate';
import { AppShell } from './shell/app-shell';
import { ADMIN_ROUTES } from './admin-routes';

export function App(): React.JSX.Element {
  const pathname = window.location.pathname;
  const adminRoute = ADMIN_ROUTES[pathname];

  // O shell envolve toda rota, também o login (exibido pelo ProtectedRoute): cabeçalho, link de pular, landmark principal
  // e o estado de conexão precisam existir para quem ainda não entrou.
  return (
    <AppShell>
      {pathname === '/recuperar-senha/confirmar' ? <RecoveryConfirmPage /> : pathname === '/perfil' ? <ProtectedRoute><ProfilePage /></ProtectedRoute> : adminRoute ? <ProtectedRoute requireAal2={adminRoute.requireAal2}>
        {adminRoute.tenantScoped ? <TenantGate><adminRoute.Page /></TenantGate> : <adminRoute.Page />}
      </ProtectedRoute> : <ProtectedRoute>
        <Card>
          <h2 className="mb-2 text-h3 font-semibold text-navy">Fundação Técnica Ativa</h2>
          <p className="max-w-compacto text-corpo text-grafite">
            A infraestrutura base do FluxID está operando com resolução determinística de conectividade,
            proteção contra exposição de credenciais e conformidade PWA. Nenhuma regra de negócio ou cadastro
            de domínio foi carregado nesta etapa.
          </p>
        </Card>
      </ProtectedRoute>}
    </AppShell>
  );
}

export default App;
