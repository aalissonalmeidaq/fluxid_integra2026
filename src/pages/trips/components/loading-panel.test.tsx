import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { detail } from '../trip-test-support';
import { LoadingPanel, type LoadingPanelProps } from './loading-panel';

const base = detail();
const checked = (id: string) => base.items.map((item) => (item.id === id ? { ...item, itemStatus: 'checked' as const } : item));

const setup = (over: Partial<LoadingPanelProps> = {}) => {
  const handlers = { onCheck: vi.fn(), onUncheck: vi.fn(), onRemove: vi.fn() };
  render(<LoadingPanel stops={base.stops} items={base.items} canOperate canRemove online busyKey={null} highlighted={new Set()} {...handlers} {...over} />);
  return handlers;
};

describe('painel de conferência', () => {
  it('mostra o contador "x de y conferidos" em texto', () => {
    setup({ items: checked('i1') });
    expect(screen.getByText('1 de 2 conferidos')).toBeInTheDocument();
  });

  it('"Conferir" e "Desfazer" por cilindro, com nome acessível próprio', () => {
    const { onCheck, onUncheck } = setup({ items: checked('i1') });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir CIL-002' }));
    expect(onCheck).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer a conferência de CIL-001' }));
    expect(onUncheck).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
    expect(screen.queryByRole('button', { name: 'Conferir CIL-001' })).not.toBeInTheDocument();
  });

  it('"Retirar da viagem" só aparece a quem tem a exceção e entrega o acionador', () => {
    const { onRemove } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar CIL-002 da viagem' }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2' }), expect.any(HTMLElement));
  });

  it('sem trip.exception não oferece a retirada; sem trip.operate não oferece a conferência', () => {
    setup({ canRemove: false });
    expect(screen.queryByRole('button', { name: /Retirar/ })).not.toBeInTheDocument();
  });

  it('sem trip.operate só se vê a lista', () => {
    setup({ canOperate: false, canRemove: false });
    expect(screen.queryByRole('button', { name: /Conferir/ })).not.toBeInTheDocument();
    expect(screen.getByText('CIL-001')).toBeInTheDocument();
  });

  it('sem conexão ou com ação em andamento os botões ficam desabilitados', () => {
    setup({ online: false });
    expect(screen.getByRole('button', { name: 'Conferir CIL-001' })).toBeDisabled();
  });

  it('a ação em andamento mostra o carregando só no botão certo', () => {
    setup({ busyKey: 'check:i1' });
    expect(screen.getByRole('button', { name: 'Conferir CIL-001' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Conferir CIL-002' })).not.toHaveAttribute('aria-busy');
  });

  it('destaca em texto os itens que faltam conferir', () => {
    setup({ highlighted: new Set(['i2']) });
    expect(screen.getAllByText('Falta conferir')).toHaveLength(1);
  });

  it('retirados saem da lista e, sem nenhum, explica', () => {
    setup({ items: base.items.map((item) => ({ ...item, itemStatus: 'removed' as const })) });
    expect(screen.getByText('Todos os cilindros foram retirados desta viagem.')).toBeInTheDocument();
    expect(screen.getByText('0 de 0 conferidos')).toBeInTheDocument();
  });

  it('não cria região de status própria', () => {
    setup();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});
