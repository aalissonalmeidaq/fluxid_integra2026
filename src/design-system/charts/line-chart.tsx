import React, { useId } from 'react';
import { ChartTable } from './chart-table';
import { corDoGrafico, numeroPtBr } from './chart-colors';

export interface LineSeries {
  id: string;
  label: string;
  values: readonly number[];
}

export interface LineChartProps {
  title: string;
  description: string;
  xLabels: readonly string[];
  series: readonly LineSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

const LARGURA = 560;
const ALTURA = 260;
const MARGEM = { esquerda: 48, direita: 16, topo: 16, base: 48 };
const TRACOS = [undefined, '8 5', '2 5', '10 4 2 4'] as const;
const MARCADORES = ['circle', 'square', 'diamond', 'triangle'] as const;

type Marcador = (typeof MARCADORES)[number];

function Marca({ forma, x, y, cor }: { forma: Marcador; x: number; y: number; cor: string }): React.JSX.Element {
  const comuns = { 'data-marker-shape': forma, fill: 'var(--color-branco)', stroke: cor, strokeWidth: 2 };
  if (forma === 'circle') return <circle {...comuns} cx={x} cy={y} r={4} />;
  if (forma === 'square') return <rect {...comuns} x={x - 4} y={y - 4} width={8} height={8} />;
  if (forma === 'diamond') return <polygon {...comuns} points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} />;
  return <polygon {...comuns} points={`${x},${y - 5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} />;
}

// Gráfico de linha em SVG próprio, sem biblioteca. Imagem nomeada com título e descrição, eixos rotulados, legenda em texto,
// traçado e marcador distintos por série e tabela equivalente. Sem animação (RF-012, RF-018, RNF-002).
export function LineChart({ title, description, xLabels, series, xAxisLabel, yAxisLabel }: LineChartProps): React.JSX.Element {
  const id = useId().replace(/:/g, '');
  const maximo = Math.max(1, ...series.flatMap((serie) => serie.values));
  const teto = Math.ceil(maximo / 10) * 10;
  const larguraUtil = LARGURA - MARGEM.esquerda - MARGEM.direita;
  const alturaUtil = ALTURA - MARGEM.topo - MARGEM.base;
  const x = (indice: number) => MARGEM.esquerda + (xLabels.length <= 1 ? larguraUtil / 2 : (indice * larguraUtil) / (xLabels.length - 1));
  const y = (valor: number) => MARGEM.topo + alturaUtil - (valor / teto) * alturaUtil;
  const passo = Math.max(1, Math.ceil(xLabels.length / 7));
  const graduacoes = [0, 0.25, 0.5, 0.75, 1].map((fracao) => Math.round(teto * fracao));
  const visivel = (indice: number, total: number) => indice % passo === 0 || indice === total - 1;

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-4">
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-descricao`} className="h-auto w-full text-grafite">
        <title id={`${id}-titulo`}>{title}</title>
        <desc id={`${id}-descricao`}>{description}</desc>
        {graduacoes.map((valor) => (
          <g key={valor}>
            <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y(valor)} y2={y(valor)} stroke="var(--color-borda-suave)" strokeWidth={1} />
            <text x={MARGEM.esquerda - 8} y={y(valor) + 4} textAnchor="end" fontSize={12} fill="currentColor">{numeroPtBr.format(valor)}</text>
          </g>
        ))}
        <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y(0)} y2={y(0)} stroke="var(--color-borda-controle)" strokeWidth={1} />
        {xLabels.map((rotulo, indice) => visivel(indice, xLabels.length) && (
          <text key={rotulo} x={x(indice)} y={ALTURA - MARGEM.base + 18} textAnchor="middle" fontSize={12} fill="currentColor">{rotulo}</text>
        ))}
        {xAxisLabel && <text x={MARGEM.esquerda + larguraUtil / 2} y={ALTURA - 8} textAnchor="middle" fontSize={12} fill="currentColor">{xAxisLabel}</text>}
        {yAxisLabel && <text x={12} y={MARGEM.topo + alturaUtil / 2} textAnchor="middle" fontSize={12} fill="currentColor" transform={`rotate(-90 12 ${MARGEM.topo + alturaUtil / 2})`}>{yAxisLabel}</text>}
        {series.map((serie, indiceDaSerie) => {
          const cor = corDoGrafico(indiceDaSerie);
          const marcador = MARCADORES[indiceDaSerie % MARCADORES.length] as Marcador;
          const traco = TRACOS[indiceDaSerie % TRACOS.length];
          const caminho = serie.values.map((valor, indice) => `${indice === 0 ? 'M' : 'L'}${x(indice).toFixed(1)} ${y(valor).toFixed(1)}`).join(' ');
          return (
            <g key={serie.id}>
              <path data-series={serie.id} data-marker={marcador} d={caminho} fill="none" stroke={cor} strokeWidth={2} {...(traco ? { strokeDasharray: traco } : {})} />
              {serie.values.map((valor, indice) => visivel(indice, serie.values.length) && (
                <Marca key={indice} forma={marcador} x={x(indice)} y={y(valor)} cor={cor} />
              ))}
            </g>
          );
        })}
      </svg>
      <ul role="list" aria-label="Legenda" className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-legenda text-grafite">
        {series.map((serie, indice) => {
          const marcador = MARCADORES[indice % MARCADORES.length] as Marcador;
          const traco = TRACOS[indice % TRACOS.length];
          return (
            <li key={serie.id} className="flex items-center gap-2">
              <svg width={32} height={12} viewBox="0 0 32 12" aria-hidden="true" focusable="false">
                <line x1={0} x2={32} y1={6} y2={6} stroke={corDoGrafico(indice)} strokeWidth={2} {...(traco ? { strokeDasharray: traco } : {})} />
                <Marca forma={marcador} x={16} y={6} cor={corDoGrafico(indice)} />
              </svg>
              <span>{serie.label}</span>
            </li>
          );
        })}
      </ul>
      <ChartTable
        caption={title}
        rowHeader={xAxisLabel ?? 'Dia'}
        columns={series.map((serie) => serie.label)}
        rows={xLabels.map((rotulo, indice) => ({ header: rotulo, cells: series.map((serie) => numeroPtBr.format(serie.values[indice] ?? 0)) }))}
      />
    </figure>
  );
}
