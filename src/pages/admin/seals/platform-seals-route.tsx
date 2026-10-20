import React, { Suspense, lazy } from 'react';
import { Loading } from '@/design-system';

// Lacres da plataforma (Spec 013) num chunk próprio, carregado só quando o Master abre a rota; nada entra no pacote de entrada.
const PlatformSealsPage = lazy(() => import('./platform-seals-page').then((m) => ({ default: m.PlatformSealsPage })));

export function PlatformSealsRoute(): React.JSX.Element {
  return (
    <Suspense fallback={<Loading variant="pagina" busy label="Carregando a página…" />}>
      <PlatformSealsPage />
    </Suspense>
  );
}
