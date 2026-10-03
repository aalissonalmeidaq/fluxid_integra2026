import React from 'react';
import { Logo } from '@/design-system/brand/logo';

export interface LogoLinkProps {
  width: number;
}

// Logotipo como link para a Visão geral ("/"). O nome do link e do h1 continua "FluxID" (o alt da imagem); o destino vai na
// dica (title).
// A navegação é por carga de página, como a do menu. A imagem encolhe se a coluna for estreita, sem distorcer.
export function LogoLink({ width }: LogoLinkProps): React.JSX.Element {
  return (
    <a href="/" title="Ir para a Visão geral" className="inline-flex min-h-alvo max-w-full items-center rounded-controle">
      <Logo variant="horizontal" width={width} className="h-auto max-w-full" />
    </a>
  );
}
