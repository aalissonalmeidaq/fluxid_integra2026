import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandPanel } from './brand-panel';

// RF-002, RA-007: painel de marca só com o logotipo oficial, a assinatura oficial e três destaques de texto.
describe('BrandPanel', () => {
  it('tem o logotipo oficial como h1 com o nome acessível "FluxID"', () => {
    render(<BrandPanel />);
    const titulo = screen.getByRole('heading', { level: 1 });
    expect(within(titulo).getByRole('img', { name: 'FluxID' })).toBeInTheDocument();
  });

  it('mostra a chamada de valor do painel', () => {
    render(<BrandPanel />);
    expect(screen.getByText('Controle seus ativos.')).toBeInTheDocument();
  });

  it('traz três destaques de texto com ícones decorativos', () => {
    const { container } = render(<BrandPanel />);
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(3);
    expect(itens[0]).toHaveTextContent(/rastreamento em tempo real/i);
    expect(itens[1]).toHaveTextContent(/alertas inteligentes/i);
    expect(itens[2]).toHaveTextContent(/decisões orientadas por dados/i);
    for (const item of itens) expect(item.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });

  it('não usa imagem fotográfica nem de terceiros: a única imagem é o logotipo', () => {
    const { container } = render(<BrandPanel />);
    const imagens = container.querySelectorAll('img');
    expect(imagens).toHaveLength(1);
    expect(imagens[0]).toHaveAttribute('alt', 'FluxID');
  });
});
