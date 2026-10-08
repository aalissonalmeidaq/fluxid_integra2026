import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnonymizedBadge, EntityStatusBadge, ValidityBadge, VehicleStatusBadge } from './status-badge';

describe('EntityStatusBadge (situação cadastral)', () => {
  it.each([['active', 'Ativo', 'ativo'], ['inactive', 'Inativo', 'bloqueado']] as const)('%s mostra o texto "%s"', (status, texto, variante) => {
    render(<EntityStatusBadge status={status} />);
    expect(screen.getByText(texto).closest('[data-variant]')).toHaveAttribute('data-variant', variante);
    expect(screen.getByText('Situação cadastral:')).toBeInTheDocument();
  });
});

describe('VehicleStatusBadge (situação operacional, independente da cadastral)', () => {
  it.each([
    ['available', 'Disponível', 'ativo'], ['maintenance', 'Em manutenção', 'pendente'], ['inactive', 'Inativo', 'bloqueado'],
  ] as const)('%s', (status, texto, variante) => {
    render(<VehicleStatusBadge status={status} />);
    expect(screen.getByText(texto).closest('[data-variant]')).toHaveAttribute('data-variant', variante);
    expect(screen.getByText('Situação do veículo:')).toBeInTheDocument();
  });
});

describe('ValidityBadge (licenciamento e CNH, calculados)', () => {
  it.each([
    ['em_dia', 'Em dia', 'ativo'], ['a_vencer', 'A vencer', 'pendente'], ['vencido', 'Vencido', 'erro'], ['sem_data', 'Sem data', 'bloqueado'],
  ] as const)('%s', (status, texto, variante) => {
    render(<ValidityBadge status={status} subject="Licenciamento" />);
    expect(screen.getByText(texto).closest('[data-variant]')).toHaveAttribute('data-variant', variante);
  });

  it('o prefixo só para leitor de tela diz de qual documento é a situação', () => {
    render(<ValidityBadge status="vencido" subject="CNH" />);
    expect(screen.getByText('CNH:')).toBeInTheDocument();
  });

  it('o estado nunca depende só da cor: há texto em todas as situações', () => {
    for (const status of ['em_dia', 'a_vencer', 'vencido', 'sem_data'] as const) {
      const { container, unmount } = render(<ValidityBadge status={status} subject="Licenciamento" />);
      expect(container.textContent?.trim().length ?? 0).toBeGreaterThan('Licenciamento: '.length);
      unmount();
    }
  });
});

describe('AnonymizedBadge', () => {
  it('mostra o texto "Anonimizado"', () => {
    render(<AnonymizedBadge />);
    expect(screen.getByText('Anonimizado')).toBeInTheDocument();
  });
});
