import React from 'react';
import { Button } from '@/design-system/components/button';
import { Logo } from '@/design-system/brand/logo';
import { usePwaInstall } from '../use-pwa-install';

// Cabeçalho enxuto, só enquanto a sessão é verificada: logotipo (o h1) e instalar PWA. Com a sessão definida, a entrada usa
// a moldura de marca e quem entrou usa a barra superior (Spec 005).
export function Header(): React.JSX.Element {
  const { isInstallable, promptInstall } = usePwaInstall();
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borda-suave bg-branco px-4 py-2 tablet:px-6">
      <h1 className="m-0">
        <Logo variant="horizontal" width={120} />
      </h1>
      {isInstallable && <Button variant="secundario" onClick={() => void promptInstall()}>Instalar App</Button>}
    </header>
  );
}
