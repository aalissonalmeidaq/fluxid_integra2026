import React from 'react';
import { DonutChart } from '@/design-system/charts';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Distribuição dos cilindros por situação, em rosca com legenda de valor e percentual e tabela equivalente (RF-013).
export function StatusBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('situacao');
  return (
    <OverviewBlock id="situacao" title="Cilindros por situação" state={state} onRetry={retry}>
      {state.status === 'ready' && (
        <DonutChart
          title="Distribuição de cilindros por situação"
          description={`Distribuição de ${state.data.total.toLocaleString('pt-BR')} cilindros de exemplo entre ${state.data.categories.map((categoria) => categoria.label.toLowerCase()).join(', ')}.`}
          total={state.data.total}
          categories={state.data.categories}
        />
      )}
    </OverviewBlock>
  );
}
