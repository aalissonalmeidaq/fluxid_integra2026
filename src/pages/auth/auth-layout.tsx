import React from 'react';
import { Button } from '@/design-system';
import { Logo } from '@/design-system/brand/logo';
import { usePwaInstall } from '@/app/use-pwa-install';
import { BrandPanel, SecureBadge } from './brand-panel';

export interface AuthLayoutProps {
  children: React.ReactNode;
}

// Moldura das telas públicas (entrada, recuperação de senha e verificação em duas etapas): painel de marca ao lado do
// conteúdo a partir de 1024 px e faixa de marca no alto abaixo disso. O formulário fica num
// cartão com o logotipo decorativo (o h1 é o do painel). Sem barra superior nem menu (RF-001, RF-007).
export function AuthLayout({ children }: AuthLayoutProps): React.JSX.Element {
  const { isInstallable, promptInstall } = usePwaInstall();
  return (
    <div className="grid min-h-full w-full flex-1 grid-cols-1 overflow-hidden rounded-card border border-borda-suave bg-branco desktop:grid-cols-2">
      <BrandPanel />
      <div className="relative flex min-w-0 flex-col justify-center gap-6 bg-linear-to-b from-branco to-info-fundo px-4 py-6 tablet:px-8 tablet:py-8 desktop:px-12 desktop:py-16">
        <SecureBadge className="absolute end-6 top-6 hidden desktop:inline-flex" />
        <div className="mx-auto flex w-full max-w-compacto flex-col gap-6 rounded-card bg-branco p-6 shadow-dialogo tablet:p-8">
          <div className="hidden justify-center desktop:flex">
            <Logo variant="horizontal" width={220} decorative />
          </div>
          {children}
        </div>
        {isInstallable && (
          <div className="flex justify-center">
            <Button variant="secundario" onClick={() => void promptInstall()}>Instalar App</Button>
          </div>
        )}
      </div>
    </div>
  );
}
