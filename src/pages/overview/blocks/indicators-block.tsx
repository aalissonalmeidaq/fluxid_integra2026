import React from 'react';
import { Icon } from '@/design-system';
import type { IndicatorTone, OverviewContentMap } from '@/domain/overview/overview-types';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Uma cor por tipo de KPI, só com pares de tokens liberados pela Spec 003 (texto da cor sobre o fundo suave, 4,5:1 ou mais).
// Ícone e rótulo continuam presentes: a cor reforça, nunca é a única informação.
const TONS: Record<IndicatorTone, string> = {
  cadastro: 'border-azul-profundo bg-info-fundo text-azul-profundo',
  viagem: 'border-ciano-acessivel bg-cinza-gelo text-ciano-acessivel',
  critico: 'border-erro bg-erro-fundo text-erro',
  sucesso: 'border-verde-acessivel bg-sucesso-fundo text-verde-acessivel',
};

function Cartoes({ data }: { data: OverviewContentMap['indicadores'] }): React.JSX.Element {
  return (
    <ul role="list" className="m-0 grid list-none grid-cols-1 gap-4 p-0 tablet:grid-cols-2 desktop:grid-cols-4">
      {data.items.map((item) => (
        <li key={item.id} data-tone={item.tone} className={`flex min-w-0 flex-col gap-1 rounded-card border border-l-4 p-4 ${TONS[item.tone]}`}>
          <Icon name={item.icon} size={24} />
          <span className="break-words text-h3 font-semibold">{item.value}</span>
          <span className="break-words text-corpo font-medium">{item.label}</span>
          <span className="break-words text-legenda">{item.note}</span>
        </li>
      ))}
    </ul>
  );
}

// Os quatro cartões de indicadores do topo, cada tipo de KPI com a sua cor (RF-010).
export function IndicatorsBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('indicadores');
  return (
    <OverviewBlock id="indicadores" title="Indicadores principais" state={state} onRetry={retry}>
      {state.status === 'ready' && <Cartoes data={state.data} />}
    </OverviewBlock>
  );
}
