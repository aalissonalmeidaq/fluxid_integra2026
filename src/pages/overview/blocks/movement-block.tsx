import React from 'react';
import { LineChart } from '@/design-system/charts';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Série diária de entradas e saídas de cilindros, em gráfico de linha com tabela equivalente (RF-012).
export function MovementBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('movimentacao');
  return (
    <OverviewBlock id="movimentacao" title="Movimentação de cilindros" state={state} onRetry={retry}>
      {state.status === 'ready' && (
        <LineChart
          title="Movimentação diária de cilindros"
          description={`Entradas e saídas de cilindros por dia, de ${state.data.days[0]?.label} a ${state.data.days[state.data.days.length - 1]?.label}.`}
          xLabels={state.data.days.map((dia) => dia.label)}
          series={state.data.series.map((serie) => ({ id: serie.id, label: serie.label, values: state.data.days.map((dia) => dia.values[serie.id] ?? 0) }))}
          xAxisLabel="Dia"
          yAxisLabel="Cilindros"
        />
      )}
    </OverviewBlock>
  );
}
