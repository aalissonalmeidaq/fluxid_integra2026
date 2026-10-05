import React from 'react';
import { Icon } from '@/design-system';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Espaço reservado do mapa: sem imagem nem marcador, só o texto de que o rastreamento chega em fase futura (RF-011).
export function MapBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('mapa');
  return (
    <OverviewBlock id="mapa" title="Cilindros e viagens no mapa" state={state} onRetry={retry}>
      {state.status === 'ready' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-borda-controle bg-cinza-gelo p-12 text-center">
          <span className="text-azul-profundo"><Icon name="mapa" size={32} /></span>
          <p className="max-w-compacto break-words text-corpo text-grafite">{state.data.message}</p>
        </div>
      )}
    </OverviewBlock>
  );
}
