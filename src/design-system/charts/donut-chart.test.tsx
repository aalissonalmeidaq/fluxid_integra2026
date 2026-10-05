import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DonutChart } from './donut-chart';

// RF-013, RF-018, RA-003, CA-004: rosca em SVG próprio com legenda em texto (valor e percentual) e tabela equivalente.
const DADOS = {
  title: 'Cilindros por situação',
  description: 'Distribuição de 1.248 cilindros de exemplo por situação.',
  total: 1248,
  categories: [
    { id: 'cheios', label: 'Cheios', value: 574, percent: 46 },
    { id: 'com-clientes', label: 'Com clientes', value: 372, percent: 30 },
    { id: 'vazios', label: 'Vazios', value: 241, percent: 19 },
    { id: 'em-manutencao', label: 'Em manutenção', value: 61, percent: 5 },
  ],
};

describe('DonutChart', () => {
  it('é uma imagem com título e descrição acessíveis', () => {
    render(<DonutChart {...DADOS} />);
    expect(screen.getByRole('img', { name: DADOS.title })).toHaveAccessibleDescription(DADOS.description);
  });

  it('a legenda em texto traz o valor e o percentual de cada categoria', () => {
    render(<DonutChart {...DADOS} />);
    const legenda = screen.getByRole('list', { name: 'Legenda' });
    const itens = within(legenda).getAllByRole('listitem');
    expect(itens).toHaveLength(4);
    expect(itens[0]).toHaveTextContent('Cheios');
    expect(itens[0]).toHaveTextContent('574');
    expect(itens[0]).toHaveTextContent('46%');
    expect(itens[3]).toHaveTextContent('Em manutenção');
    expect(itens[3]).toHaveTextContent('5%');
  });

  it('traz uma tabela com os mesmos dados do desenho', () => {
    render(<DonutChart {...DADOS} />);
    const tabela = screen.getByRole('table', { name: DADOS.title });
    expect(within(tabela).getAllByRole('columnheader').map((celula) => celula.textContent)).toEqual(['Situação', 'Cilindros', 'Percentual']);
    const linhas = within(tabela).getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(4);
    expect(within(linhas[1] as HTMLElement).getAllByRole('cell').map((celula) => celula.textContent)).toEqual(['372', '30%']);
  });

  it('distingue as fatias por padrão de preenchimento, nunca só por cor', () => {
    const { container } = render(<DonutChart {...DADOS} />);
    const fatias = Array.from(container.querySelectorAll('[data-slice]'));
    expect(fatias).toHaveLength(4);
    expect(new Set(fatias.map((fatia) => fatia.getAttribute('data-pattern'))).size).toBe(4);
  });

  it('mostra o total no centro em texto', () => {
    render(<DonutChart {...DADOS} />);
    expect(screen.getAllByText('1.248').length).toBeGreaterThan(0);
  });

  it('não usa cor literal, animação nem transição', () => {
    const { container } = render(<DonutChart {...DADOS} />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgb\(|animate|transition/i);
  });
});
