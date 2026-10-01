import React from 'react';
import { Button } from '@/design-system/components/button';
import { Logo } from '@/design-system/brand/logo';
import { useAuth } from '../auth/auth-context';
import { usePwaInstall } from '../use-pwa-install';
import { TenantIndicator } from '../tenant/tenant-indicator';

export interface HeaderProps {
  // Botão do menu (só existe abaixo de 768 px); entra à esquerda do logotipo, depois do link de pular na ordem de Tab.
  menuToggle?: React.ReactNode;
}

// Cabeçalho: logotipo horizontal e, para quem entrou, organização ativa e sair; o perfil está no menu. Quebra em linhas em 360 px.
export function Header({ menuToggle }: HeaderProps): React.JSX.Element {
  const { isInstallable, promptInstall } = usePwaInstall();
  const { state, logout } = useAuth();
  const authenticated = state.status === 'authenticated';
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borda-suave bg-branco px-4 py-2 tablet:px-6">
      <div className="flex items-center gap-2">
        {menuToggle}
        <h1 className="m-0">
          <Logo variant="horizontal" width={120} />
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isInstallable && <Button variant="secundario" onClick={() => void promptInstall()}>Instalar App</Button>}
        {authenticated && <TenantIndicator />}
        {authenticated && (
          <Button variant="secundario" onClick={() => void logout()}>
            Sair
          </Button>
        )}
      </div>
    </header>
  );
}
