import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast';
import { cores } from '../tokens';
import { CORES_DOS_GRAFICOS } from './index';
import { LineChart } from './line-chart';

// RF-012, RF-018, RA-003, CA-004: gráfico de linha em SVG próprio, acessível, sem depender só de cor nem de biblioteca.
const DADOS = {
  title: 'Movimentação diária de cilindros',
  description: 'Entradas e saídas de cilindros por dia, de 18/09 a 21/09.',
  xLabels: ['18/09', '19/09', '20/09', '21/09'],
  series: [
    { id: 'entradas', label: 'Entradas', values: [38, 42, 35, 47] },
    { id: 'saidas', label: 'Saídas', values: [31, 36, 40, 39] },
  ],
};

describe('LineChart', () => {
  it('é uma imagem com título e descrição acessíveis', () => {
    render(<LineChart {...DADOS} />);
    const grafico = screen.getByRole('img', { name: DADOS.title });
    expect(grafico).toHaveAccessibleDescription(DADOS.description);
  });

  it('traz uma tabela com os mesmos dados do desenho', () => {
    render(<LineChart {...DADOS} />);
    const tabela = screen.getByRole('table', { name: DADOS.title });
    const cabecalho = within(tabela).getAllByRole('columnheader').map((celula) => celula.textContent);
    expect(cabecalho).toEqual(['Dia', 'Entradas', 'Saídas']);
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(4);
    expect(within(linhas[0] as HTMLElement).getAllByRole('cell').map((celula) => celula.textContent)).toEqual(['38', '31']);
    expect(within(linhas[3] as HTMLElement).getByRole('rowheader')).toHaveTextContent('21/09');
  });

  it('distingue as séries por traçado e marcador, nunca só por cor', () => {
    const { container } = render(<LineChart {...DADOS} />);
    const tracos = Array.from(container.querySelectorAll<SVGPathElement>('path[data-series]'));
    expect(tracos).toHaveLength(2);
    const marcas = new Set(tracos.map((traco) => `${traco.getAttribute('stroke-dasharray') ?? ''}|${traco.getAttribute('data-marker')}`));
    expect(marcas.size).toBe(2);
    expect(container.querySelectorAll('[data-marker-shape]').length).toBeGreaterThan(0);
  });

  it('tem legenda em texto com o rótulo de cada série e os eixos rotulados', () => {
    render(<LineChart {...DADOS} xAxisLabel="Dia" yAxisLabel="Cilindros" />);
    const legenda = screen.getByRole('list', { name: 'Legenda' });
    expect(legenda).toHaveTextContent('Entradas');
    expect(legenda).toHaveTextContent('Saídas');
    expect(screen.getAllByText('Cilindros').length).toBeGreaterThan(0);
  });

  it('usa só cores de tokens com 3:1 ou mais contra o branco', () => {
    for (const nome of CORES_DOS_GRAFICOS) {
      expect(Object.keys(cores)).toContain(nome);
      expect(contrastRatio(cores[nome], cores.branco)).toBeGreaterThanOrEqual(3);
    }
    expect(CORES_DOS_GRAFICOS).toEqual(['navy', 'azul-royal', 'ciano-acessivel', 'verde-acessivel']);
  });

  it('não usa cor literal, animação nem transição', () => {
    const { container } = render(<LineChart {...DADOS} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|animate|transition/i);
  });

  it('o projeto não depende de biblioteca de gráficos', () => {
    const pacote = JSON.parse(readFileSync('package.json', 'utf-8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const nomes = Object.keys({ ...pacote.dependencies, ...pacote.devDependencies });
    expect(nomes.filter((nome) => /chart|d3|recharts|victory|plotly|echarts|visx|nivo/i.test(nome))).toEqual([]);
  });
});
