import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ITEM_STATUSES, type CustodyStatus, type ItemStatus } from '@/domain/trips/trip-vocabulary';
import { ItemBadges } from './trip-badges';

const CUSTODIES: CustodyStatus[] = ['in_organization', 'in_transit', 'at_customer'];
// Textos que a pessoa vê: todos os nós de texto, menos os prefixos só para leitor de tela (terminam em dois-pontos).
const visible = (container: HTMLElement): string[] => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').trim();
    if (text !== '' && !text.endsWith(':')) texts.push(text);
  }
  return texts;
};

describe('ItemBadges: situação do item, bloqueio e custódia sem selos repetidos', () => {
  it('item e cilindro em trânsito aparecem num selo só, que diz de qual estado se trata', () => {
    render(<ItemBadges itemStatus="in_transit" lockStatus="locked" custodyStatus="in_transit" />);
    expect(screen.getAllByText(/Em trânsito/)).toHaveLength(1);
    expect(screen.getByText('Situação do cilindro na viagem e custódia:')).toBeInTheDocument();
    expect(screen.queryByText('Custódia:')).not.toBeInTheDocument();
    expect(screen.getByText('Bloqueado (lógico)')).toBeInTheDocument();
  });

  it('item não entregue com o cilindro ainda em trânsito mostra os dois estados, com rótulos diferentes', () => {
    render(<ItemBadges itemStatus="not_delivered" lockStatus="locked" custodyStatus="in_transit" />);
    expect(screen.getByText('Não entregue')).toBeInTheDocument();
    expect(screen.getByText('Custódia:')).toBeInTheDocument();
    expect(screen.getByText('Situação do cilindro na viagem:')).toBeInTheDocument();
  });

  it('item entregue no cliente mostra a situação do item e a custódia', () => {
    render(<ItemBadges itemStatus="delivered" lockStatus="unlocked" custodyStatus="at_customer" />);
    expect(screen.getByText('Entregue')).toBeInTheDocument();
    expect(screen.getByText('No cliente')).toBeInTheDocument();
    expect(screen.getByText('Desbloqueado')).toBeInTheDocument();
  });

  it('o bloqueio "sem bloqueio" não aparece', () => {
    render(<ItemBadges itemStatus="planned" lockStatus="none" custodyStatus="in_organization" />);
    expect(screen.queryByText(/Bloqueio:/)).not.toBeInTheDocument();
  });

  it.each(ITEM_STATUSES.flatMap((item) => CUSTODIES.map((custody) => [item, custody] as [ItemStatus, CustodyStatus])))(
    'nenhuma combinação (%s, %s) mostra duas vezes o mesmo texto visível',
    (item, custody) => {
      const { container } = render(<ItemBadges itemStatus={item} lockStatus="none" custodyStatus={custody} />);
      const texts = visible(container);
      expect(new Set(texts).size, texts.join(' | ')).toBe(texts.length);
    },
  );
});
