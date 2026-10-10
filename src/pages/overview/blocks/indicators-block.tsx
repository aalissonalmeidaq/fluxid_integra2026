import React from 'react';
import { Icon } from '@/design-system';
import type { IndicatorTone, OverviewContentMap } from '@/domain/overview/overview-types';
import { OverviewBlock } from '../overview-block';
import { useOverviewBlock } from '../use-overview-block';

// Uma cor por tipo de KPI, só com pares de tokens liberados pela Spec 003 (texto da cor sobre o fundo suave, 4,5:1 ou mais).
// Ícone e rótulo continuam presentes: a cor reforça, nunca é a única informação.
const TONS: Record<IndicatorTone, string> = {
  cadastro: 'border border-azul-profundo bg-info-fundo text-azul-profundo',
  viagem: 'border border-ciano-acessivel bg-cinza-gelo text-ciano-acessivel',
  critico: 'border border-erro bg-erro-fundo text-erro',
  sucesso: 'border border-verde-acessivel bg-sucesso-fundo text-verde-acessivel',
};

// Destino de cada KPI: o número leva à tela que o explica. Lacres ainda não têm tela própria, então o cartão fica sem link.
const DESTINOS: Record<string, { href: string; acao: string }> = {
  cadastrados: { href: '/cilindros', acao: 'Abrir cilindros' },
  'em-viagem': { href: '/viagens', acao: 'Abrir viagens' },
  'alertas-criticos': { href: '/alertas', acao: 'Abrir alertas' },
};

function Cartoes({ data }: { data: OverviewContentMap['indicadores'] }): React.JSX.Element {
  return (
    <ul role="list" className="m-0 grid list-none grid-cols-1 gap-4 p-0 tablet:grid-cols-2 desktop:grid-cols-4">
      {data.items.map((item) => {
        const destino = DESTINOS[item.id];
        const conteudo = (
          <>
            <span className="flex items-center gap-2 text-corpo font-medium">
              <Icon name={item.icon} size={24} />
              <span className="min-w-0 break-words">{item.label}</span>
            </span>
            <span className="break-words text-h2 font-bold">{item.value}</span>
            <span className="break-words text-legenda">{item.note}</span>
          </>
        );
        const caixa = 'flex h-full min-w-0 flex-col gap-2 rounded-card border p-4';
        return (
          <li key={item.id} data-tone={item.tone} className={`min-w-0 rounded-card ${TONS[item.tone]}`}>
            {destino ? (
              <a href={destino.href} aria-label={`${destino.acao}: ${item.label}, ${item.value}`} className={`${caixa} border-transparent hover:bg-branco`}>{conteudo}</a>
            ) : (
              <div className={`${caixa} border-transparent`}>{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Os quatro cartões de indicadores, em faixa no topo, antes de mapa e gráficos, cada tipo de KPI com a sua cor (RF-010).
export function IndicatorsBlock(): React.JSX.Element {
  const { state, retry } = useOverviewBlock('indicadores');
  return (
    <OverviewBlock id="indicadores" title="Indicadores principais" state={state} onRetry={retry} className="w-full" bare>
      {state.status === 'ready' && <Cartoes data={state.data} />}
    </OverviewBlock>
  );
}
