import React from 'react';
import { ProtectedRoute } from './routing/protected-route';
import { RecoveryConfirmPage } from '@/pages/auth/recovery-confirm-page';
import { TenantsDashboardPage } from '@/pages/admin/tenants-dashboard-page';
import { TenantMembersPage } from '@/pages/admin/tenant-members-page';
import { TenantRolesPage } from '@/pages/admin/tenant-roles-page';
import { ProfilePage } from '@/pages/profile/profile-page';
import { PlatformAuditLogPage, TenantAuditLogPage } from '@/pages/admin/tenant-audit-log-page';
import { Card } from '@/design-system/components/card';
import { TenantGate } from './tenant/tenant-gate';
import { AppShell } from './shell/app-shell';

// Cada área declara o que exige: segundo fator (AAL2) e tenant ativo confirmado. A decisão final é sempre do servidor.
// A leitura da auditoria do tenant não é ação crítica e dispensa AAL2; a auditoria da plataforma e a administração exigem.
interface AdminRoute { Page: () => React.JSX.Element; tenantScoped: boolean; requireAal2: boolean }
const ADMIN_ROUTES: Record<string, AdminRoute> = {
  '/admin/tenants': { Page: TenantsDashboardPage, tenantScoped: false, requireAal2: true },
  '/admin/membros': { Page: TenantMembersPage, tenantScoped: true, requireAal2: true },
  '/admin/papeis': { Page: TenantRolesPage, tenantScoped: true, requireAal2: true },
  '/admin/auditoria': { Page: TenantAuditLogPage, tenantScoped: true, requireAal2: false },
  '/admin/auditoria-global': { Page: PlatformAuditLogPage, tenantScoped: false, requireAal2: true },
};
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
