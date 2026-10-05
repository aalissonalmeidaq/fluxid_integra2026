import React from 'react';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// As três medidas operacionais de exemplo: rótulo, valor e unidade (RF-015a).
export function PerformanceBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('desempenho');
  return (
    <OverviewBlock id="desempenho" title="Desempenho operacional" state={state} onRetry={retry}>
      {state.status === 'ready' && (
        <dl className="m-0 grid grid-cols-1 gap-4 desktop:grid-cols-3">
          {state.data.items.map((item) => (
            <div key={item.id} className="flex min-w-0 flex-col gap-1 rounded-card border border-borda-suave bg-cinza-gelo p-4">
              <dt className="break-words text-corpo text-grafite">{item.label}</dt>
              <dd className="m-0 break-words text-h3 font-semibold text-navy">{item.value} <span className="text-corpo font-medium">{item.unit}</span></dd>
            </div>
          ))}
        </dl>
      )}
    </OverviewBlock>
  );
}
