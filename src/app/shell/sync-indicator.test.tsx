import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IndicatorInput } from '@/domain/field/sync-status';
import { SyncIndicator } from './sync-indicator';

// Spec 010, T027 (RF-004, RF-030; contracts/telas-e-fluxos.md §1): indicador discreto ao lado do estado de conexão.
const input = (over: Partial<IndicatorInput> = {}): IndicatorInput => ({ pending: 0, syncing: 0, total: 0, conflicts: 0, oldPending: 0, online: true, ...over });

describe('indicador de sincronização', () => {
  it('sem pendência não mostra nada à vista, mas mantém a região de status para os anúncios', () => {
    render(<SyncIndicator counts={input()} onOpen={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('mostra "3 pendentes" no botão, com nome acessível completo, e abre a tela Sincronização', () => {
    const onOpen = vi.fn();
    render(<SyncIndicator counts={input({ pending: 3, total: 3 })} onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: 'Abrir sincronização: 3 pendentes' });
    expect(button).toHaveTextContent('3 pendentes');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
  });

  it.each([
    [{ conflicts: 1, total: 1 }, '1 conflito'],
    [{ pending: 3, total: 3, online: false }, 'Sem conexão, 3 pendentes'],
    [{ pending: 3, total: 3, oldPending: 1 }, '3 pendentes, 1 há mais de 24 h'],
    [{ pending: 3, syncing: 2, total: 5 }, 'Enviando 2 de 5…'],
  ] as const)('texto %j: "%s"', (over, text) => {
    render(<SyncIndicator counts={input(over)} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: `Abrir sincronização: ${text}` })).toBeInTheDocument();
  });

  it('a mudança é anunciada na região de status', () => {
    const { rerender } = render(<SyncIndicator counts={input({ pending: 1, total: 1 })} onOpen={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 pendente');
    rerender(<SyncIndicator counts={input({ pending: 2, total: 2 })} onOpen={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('2 pendentes');
  });

  it('sem contagem (fila indisponível) não renderiza nada', () => {
    const { container } = render(<SyncIndicator counts={null} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
