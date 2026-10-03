import React, { useId } from 'react';
import { ChartTable } from './chart-table';
import { corDoGrafico, numeroPtBr } from './chart-colors';

export interface DonutCategory {
  id: string;
  label: string;
  value: number;
  percent: number;
}

export interface DonutChartProps {
  title: string;
  description: string;
  total: number;
  categories: readonly DonutCategory[];
  // Títulos das colunas da tabela equivalente.
  columnLabels?: { category: string; value: string; percent: string };
  // Texto sob o total, no centro da rosca.
  totalLabel?: string;
}

const PADROES = ['solido', 'diagonal', 'pontos', 'horizontal'] as const;
const CENTRO = 100;
const RAIO_EXTERNO = 90;
const RAIO_INTERNO = 56;

type Padrao = (typeof PADROES)[number];

function ponto(raio: number, angulo: number): string {
  return `${(CENTRO + raio * Math.sin(angulo)).toFixed(2)} ${(CENTRO - raio * Math.cos(angulo)).toFixed(2)}`;
}

function fatia(inicio: number, fim: number): string {
  const grande = fim - inicio > Math.PI ? 1 : 0;
  return `M${ponto(RAIO_EXTERNO, inicio)} A${RAIO_EXTERNO} ${RAIO_EXTERNO} 0 ${grande} 1 ${ponto(RAIO_EXTERNO, fim)} L${ponto(RAIO_INTERNO, fim)} A${RAIO_INTERNO} ${RAIO_INTERNO} 0 ${grande} 0 ${ponto(RAIO_INTERNO, inicio)} Z`;
}

// Padrões de preenchimento brancos por cima da cor: a fatia se distingue pela textura, nunca só pela cor (RF-018).
function Padroes({ id }: { id: string }): React.JSX.Element {
  const traco = { stroke: 'var(--color-branco)', strokeWidth: 3 };
  return (
    <defs>
      <pattern id={`${id}-diagonal`} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={8} {...traco} /></pattern>
      <pattern id={`${id}-pontos`} width={10} height={10} patternUnits="userSpaceOnUse"><circle cx={5} cy={5} r={2} fill="var(--color-branco)" /></pattern>
      <pattern id={`${id}-horizontal`} width={8} height={8} patternUnits="userSpaceOnUse"><line x1={0} y1={4} x2={8} y2={4} {...traco} /></pattern>
    </defs>
  );
}

// Rosca em SVG próprio, sem biblioteca: imagem nomeada, total no centro, legenda com valor e percentual em texto, padrão
// de preenchimento distinto por fatia e tabela equivalente. Sem animação (RF-013, RF-018, RNF-002).
export function DonutChart({
  title,
  description,
  total,
  categories,
  columnLabels = { category: 'Situação', value: 'Cilindros', percent: 'Percentual' },
  totalLabel = 'cilindros',
}: DonutChartProps): React.JSX.Element {
  const id = useId().replace(/:/g, '');
  const soma = categories.reduce((acumulado, categoria) => acumulado + categoria.value, 0) || 1;
  const fatias = categories.map((categoria, indice) => {
    const inicio = (categories.slice(0, indice).reduce((acumulado, anterior) => acumulado + anterior.value, 0) / soma) * 2 * Math.PI;
    const fim = inicio + (categoria.value / soma) * 2 * Math.PI;
    // Uma única categoria ocuparia 360 graus; o recuo mínimo evita que o arco vire um ponto.
    return { categoria, indice, caminho: fatia(inicio, Math.min(fim, inicio + 2 * Math.PI - 0.0001)) };
  });

  return (
    <figure className="m-0 flex min-w-0 flex-col items-center gap-4">
      <svg viewBox="0 0 200 200" role="img" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-descricao`} className="h-auto w-full max-w-compacto text-grafite">
        <title id={`${id}-titulo`}>{title}</title>
        <desc id={`${id}-descricao`}>{description}</desc>
        <Padroes id={id} />
        {fatias.map(({ categoria, indice, caminho }) => {
          const padrao = PADROES[indice % PADROES.length] as Padrao;
          return (
            <g key={categoria.id} data-slice={categoria.id} data-pattern={padrao}>
              <path d={caminho} fill={corDoGrafico(indice)} stroke="var(--color-branco)" strokeWidth={2} />
              {padrao !== 'solido' && <path d={caminho} fill={`url(#${id}-${padrao})`} />}
            </g>
          );
        })}
        <text x={CENTRO} y={CENTRO + 2} textAnchor="middle" fontSize={24} fontWeight={600} fill="currentColor">{numeroPtBr.format(total)}</text>
        <text x={CENTRO} y={CENTRO + 20} textAnchor="middle" fontSize={12} fill="currentColor">{totalLabel}</text>
      </svg>
      <ul role="list" aria-label="Legenda" className="m-0 flex w-full list-none flex-col gap-2 p-0 text-corpo text-grafite">
        {categories.map((categoria, indice) => {
          const padrao = PADROES[indice % PADROES.length] as Padrao;
          return (
            <li key={categoria.id} className="flex items-center gap-2">
              <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <rect width={16} height={16} fill={corDoGrafico(indice)} />
                {padrao !== 'solido' && <rect width={16} height={16} fill={`url(#${id}-${padrao})`} />}
              </svg>
              <span className="min-w-0 break-words">{categoria.label}: {numeroPtBr.format(categoria.value)} ({categoria.percent}%)</span>
            </li>
          );
        })}
      </ul>
      <ChartTable
        caption={title}
        rowHeader={columnLabels.category}
        columns={[columnLabels.value, columnLabels.percent]}
        rows={categories.map((categoria) => ({ header: categoria.label, cells: [numeroPtBr.format(categoria.value), `${categoria.percent}%`] }))}
      />
    </figure>
  );
}
