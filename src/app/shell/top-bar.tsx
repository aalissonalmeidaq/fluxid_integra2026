import React from 'react';
import { Button } from '@/design-system/components/button';
import { pontosDeQuebra } from '@/design-system/tokens';
import { TenantIndicator } from '../tenant/tenant-indicator';
import { usePwaInstall } from '../use-pwa-install';
import { useMinWidth } from '../use-min-width';
import { ConnectionBar } from './connection-bar';
import { LogoLink } from './logo-link';
import { UserMenu } from './user-menu';

export interface TopBarProps {
  // Botão do menu (só existe abaixo de 768 px); entra à esquerda do logotipo, depois do link de pular na ordem de Tab.
  menuToggle?: React.ReactNode;
}

// Barra superior da sessão autenticada (RF-021). Abaixo de 768 px leva o botão do menu e o logotipo (o h1); a partir de
// 768 px o logotipo fica no topo do menu lateral e a barra não o repete, para haver um só h1. Reúne a organização ativa, o
// instalar PWA e o menu da pessoa.
export function TopBar({ menuToggle }: TopBarProps): React.JSX.Element {
  const { isInstallable, promptInstall } = usePwaInstall();
  const wide = useMinWidth(pontosDeQuebra.tablet);
  return (
    <header className={`flex flex-wrap items-center justify-between gap-4 border-b border-borda-suave bg-branco py-2 ps-4 tablet:px-6 ${menuToggle ? 'pe-16' : 'pe-4'}`}>
      <div className="flex items-center gap-2">
        {menuToggle}
        {!wide && (
          <h1 className="m-0">
            <LogoLink width={152} />
          </h1>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConnectionBar inline />
        <TenantIndicator />
        {isInstallable && <Button variant="secundario" onClick={() => void promptInstall()}>Instalar App</Button>}
        <UserMenu />
      </div>
    </header>
  );
}
