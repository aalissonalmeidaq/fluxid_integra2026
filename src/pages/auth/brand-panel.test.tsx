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
    expect(screen.getByText('Cada cilindro, uma identidade.')).toBeInTheDocument();
  });

  it('traz três destaques de texto com ícones decorativos', () => {
    const { container } = render(<BrandPanel />);
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(3);
    expect(itens[0]).toHaveTextContent(/custódia individual de cada cilindro/i);
    expect(itens[1]).toHaveTextContent(/trilha de auditoria imutável/i);
    expect(itens[2]).toHaveTextContent(/operação de campo com sinal instável/i);
    for (const item of itens) expect(item.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });

  it('desenha a cadeia de custódia: cinco etapas ligadas, decorativa e sem texto', () => {
    const { container } = render(<BrandPanel />);
    const cadeia = container.querySelector('svg[data-motivo="cadeia-de-custodia"]');
    expect(cadeia).not.toBeNull();
    expect(cadeia).toHaveAttribute('aria-hidden', 'true');
    expect(cadeia?.querySelectorAll('[data-etapa]')).toHaveLength(5);
    expect(cadeia?.querySelectorAll('[data-etapa="cliente"]')).toHaveLength(1);
    expect(cadeia?.querySelector('text')).toBeNull();
  });

  it('mostra o ciclo do cilindro como diagrama: cinco etapas em ordem, cliente em destaque, só a partir do tablet', () => {
    const { container } = render(<BrandPanel />);
    const ciclo = container.querySelector('[data-ciclo]');
    expect(ciclo).not.toBeNull();
    expect(ciclo).toHaveAttribute('aria-hidden', 'true');
    expect(ciclo?.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(ciclo?.className).toMatch(/tablet:block/);
    const etapas = Array.from(ciclo?.querySelectorAll('[data-passo]') ?? []);
    expect(etapas.map((e) => e.textContent)).toEqual(['Envase', 'Estoque', 'Viagem', 'Cliente', 'Retorno']);
    expect(ciclo?.querySelectorAll('[data-destaque="true"]')).toHaveLength(1);
    expect(ciclo?.querySelector('[data-destaque="true"] [data-passo]')?.textContent).toBe('Cliente');
  });

  it('no celular (abaixo de 768 px) mostra só logotipo e a primeira frase: selo e segunda frase entram a partir do tablet', () => {
    render(<BrandPanel />);
    const selo = screen.getByText('Ambiente seguro');
    expect(selo.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(selo.className).toMatch(/tablet:inline-flex/);
    const segunda = screen.getByText('Cada movimento, uma evidência.');
    expect(segunda.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(segunda.className).toMatch(/tablet:block/);
    expect(screen.getByText('Cada cilindro, uma identidade.').className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('o selo de ambiente seguro não usa o verde de estado', () => {
    render(<BrandPanel />);
    const selo = screen.getByText('Ambiente seguro');
    expect(selo.className).not.toMatch(/sucesso|verde/);
  });

  it('não usa imagem fotográfica nem de terceiros: a única imagem é o logotipo', () => {
    const { container } = render(<BrandPanel />);
    const imagens = container.querySelectorAll('img');
    expect(imagens).toHaveLength(1);
    expect(imagens[0]).toHaveAttribute('alt', 'FluxID');
  });
});
