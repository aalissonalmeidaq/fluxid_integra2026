import React from 'react';
import { Button } from '@/design-system/components/button';
import { Logo } from '@/design-system/brand/logo';
import { useAuth } from '../auth/auth-context';
import { usePwaInstall } from '../use-pwa-install';
import { TenantIndicator } from '../tenant/tenant-indicator';

const linkClass =
  'inline-flex min-h-alvo min-w-alvo items-center justify-center rounded-controle border border-azul-profundo px-4 text-corpo font-semibold text-azul-profundo hover:bg-info-fundo';

// Cabeçalho: logotipo horizontal e, para quem entrou, organização ativa, perfil e sair. Quebra em linhas em 360 px.
export function Header(): React.JSX.Element {
  const { isInstallable, promptInstall } = usePwaInstall();
  const { state, logout } = useAuth();
  const authenticated = state.status === 'authenticated';
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borda-suave bg-branco px-4 py-2 tablet:px-6">
      <h1 className="m-0">
        <Logo variant="horizontal" width={120} />
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        {isInstallable && <Button variant="secundario" onClick={() => void promptInstall()}>Instalar App</Button>}
        {authenticated && <TenantIndicator />}
        {authenticated && (
          <a href="/perfil" className={linkClass}>
            Meu perfil
          </a>
        )}
        {authenticated && (
          <Button variant="secundario" onClick={() => void logout()}>
            Sair
          </Button>
        )}
      </div>
    </header>
  );
}
