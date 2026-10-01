import React from 'react';
import { useConnectivity } from './connectivity-context';
import { usePwaInstall } from './use-pwa-install';
import { useOnlineStatus } from './use-online-status';
import { ConnectivityStatus } from '@/components/system/ConnectivityStatus';
import { useAuth } from './auth/auth-context';
import { ProtectedRoute } from './routing/protected-route';
import { RecoveryConfirmPage } from '@/pages/auth/recovery-confirm-page';
import { TenantsDashboardPage } from '@/pages/admin/tenants-dashboard-page';
import { TenantMembersPage } from '@/pages/admin/tenant-members-page';
import { TenantRolesPage } from '@/pages/admin/tenant-roles-page';
import { ProfilePage } from '@/pages/profile/profile-page';
import { PlatformAuditLogPage, TenantAuditLogPage } from '@/pages/admin/tenant-audit-log-page';
import { TenantGate } from './tenant/tenant-gate';
import { TenantIndicator } from './tenant/tenant-indicator';

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
  const { result, reconnect } = useConnectivity();
  const { isInstallable, promptInstall } = usePwaInstall();
  const isOnline = useOnlineStatus();
  const { state: authState, logout } = useAuth();
  const pathname = window.location.pathname;
  const adminRoute = ADMIN_ROUTES[pathname];

  const focusMainContent = (): void => {
    document.getElementById('main-content')?.focus();
  };

  // O login é exibido pelo ProtectedRoute dentro do shell: cabeçalho, link de pular, landmark principal e o estado de
  // conexão (com o botão de reconectar) precisam existir também para quem ainda não entrou.
  return (
    <div className="min-h-screen bg-[#F3F7FA] text-[#26384A] flex flex-col w-full selection:bg-[#1766D9] selection:text-white">
      <a
        href="#main-content"
        tabIndex={0}
        onClick={focusMainContent}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-3 focus:text-[#163B72] focus:outline-none focus:ring-2 focus:ring-[#1766D9]"
      >
        Pular para o conteúdo principal
      </a>
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-300 text-[#26384A] px-4 py-2 text-center text-xs font-semibold tracking-wide flex items-center justify-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-[#26384A] animate-ping motion-reduce:animate-none" aria-hidden="true" />
          <span>Dispositivo sem conexão de rede. Modo offline em operação.</span>
        </div>
      )}

      <header className="border-b border-[#D7E2EE] bg-white px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" width="28" height="28" className="rounded-lg shadow-sm" />
          <h1 className="text-xl font-bold tracking-tight text-[#163B72]">FluxID</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isInstallable && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="inline-flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#159B19] hover:bg-[#37D20A] text-white transition-colors focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:outline-none"
            >
              <span>Instalar App</span>
            </button>
          )}

          {authState.status === 'authenticated' && <TenantIndicator />}

          {authState.status === 'authenticated' && (
            <a href="/perfil" className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#26384A] text-[#26384A] focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:outline-none">
              Meu perfil
            </a>
          )}

          <ConnectivityStatus result={result} onReconnect={reconnect} />

          {authState.status === 'authenticated' && (
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-11 items-center px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#26384A] text-[#26384A] focus-visible:ring-2 focus-visible:ring-[#1766D9] focus-visible:outline-none"
            >
              Sair
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full" id="main-content" tabIndex={-1}>
        {pathname === '/recuperar-senha/confirmar' ? <RecoveryConfirmPage /> : pathname === '/perfil' ? <ProtectedRoute><ProfilePage /></ProtectedRoute> : adminRoute ? <ProtectedRoute requireAal2={adminRoute.requireAal2}>
          {adminRoute.tenantScoped ? <TenantGate><adminRoute.Page /></TenantGate> : <adminRoute.Page />}
        </ProtectedRoute> : <ProtectedRoute>
          <div className="rounded-xl border border-[#D7E2EE] bg-white p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-[#163B72] mb-2">Fundação Técnica Ativa</h2>
            <p className="text-sm text-[#26384A] leading-relaxed max-w-2xl">
              A infraestrutura base do FluxID está operando com resolução determinística de conectividade,
              proteção contra exposição de credenciais e conformidade PWA. Nenhuma regra de negócio ou cadastro
              de domínio foi carregado nesta etapa.
            </p>
          </div>
        </ProtectedRoute>}      </main>

      <footer className="border-t border-[#D7E2EE] px-4 py-3 sm:px-6 text-center text-xs text-[#26384A]">
        FluxID &copy; 2026 &mdash; Plataforma de Identidade e Rastreabilidade de Cilindros
      </footer>
    </div>
  );
}

export default App;
