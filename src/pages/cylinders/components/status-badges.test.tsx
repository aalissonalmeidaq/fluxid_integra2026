import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IdentifierWarning, StatusBadges } from './status-badges';

describe('StatusBadges (RF-018: três situações independentes, com texto e ícone)', () => {
  it('mostra as três situações separadas, cada uma com texto', () => {
    render(<StatusBadges status="active" stockStatus="in_stock" hydroStatus="a_vencer" />);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Em estoque')).toBeInTheDocument();
    expect(screen.getByText('A vencer')).toBeInTheDocument();
  });

  it('cada situação tem um prefixo só para leitor de tela, para não confundir "Ativo" com "Em estoque"', () => {
    render(<StatusBadges status="inactive" stockStatus="out_of_stock" hydroStatus="vencido" />);
    expect(screen.getByText('Situação cadastral:')).toBeInTheDocument();
    expect(screen.getByText('Situação de estoque:')).toBeInTheDocument();
    expect(screen.getByText('Situação do teste:')).toBeInTheDocument();
  });

  it.each([
    ['em_dia', 'Em dia', 'ativo'],
    ['a_vencer', 'A vencer', 'pendente'],
    ['vencido', 'Vencido', 'erro'],
    ['reprovado', 'Reprovado', 'erro'],
    ['sem_teste', 'Sem teste', 'bloqueado'],
  ] as const)('situação do teste %s', (hydro, label, variant) => {
    const { container } = render(<StatusBadges status="active" stockStatus="out_of_stock" hydroStatus={hydro} />);
    const badge = screen.getByText(label).closest('[data-variant]');
    expect(badge).toHaveAttribute('data-variant', variant);
    expect(container.querySelectorAll('[data-variant]')).toHaveLength(3);
  });

  it('inativo e fora do estoque usam a aparência neutra, sem depender só da cor', () => {
    render(<StatusBadges status="inactive" stockStatus="out_of_stock" hydroStatus="sem_teste" />);
    expect(screen.getByText('Inativo').closest('[data-variant]')).toHaveAttribute('data-variant', 'bloqueado');
    expect(screen.getByText('Fora do estoque')).toBeInTheDocument();
  });
});

describe('IdentifierWarning', () => {
  it('avisa "Sem identificador" quando não há identificador ativo', () => {
    render(<IdentifierWarning activeCount={0} />);
    expect(screen.getByText('Sem identificador')).toBeInTheDocument();
  });

  it('não mostra nada quando há identificador ativo', () => {
    const { container } = render(<IdentifierWarning activeCount={2} />);
    expect(container).toBeEmptyDOMElement();
  });
});
