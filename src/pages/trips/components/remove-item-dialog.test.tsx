import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RemoveItemDialog } from './remove-item-dialog';

const setup = (over: Partial<React.ComponentProps<typeof RemoveItemDialog>> = {}) => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  const handlers = { onCancel: vi.fn(), onConfirm: vi.fn() };
  const view = render(<RemoveItemDialog serialNumber="CIL-002" busy={false} error={null} returnFocusTo={trigger} {...handlers} {...over} />);
  return { ...handlers, trigger, unmount: view.unmount };
};

describe('diálogo de retirada', () => {
  it('é um diálogo com o título do cilindro e foco na justificativa', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Retirar CIL-002 da viagem' })).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa')).toHaveFocus();
  });

  it('justificativa obrigatória: erro junto do campo e nenhuma retirada', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar da viagem' }));
    expect(screen.getByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Justificativa')).toHaveFocus();
  });

  it('confirma com a justificativa limpa', () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: '  Cilindro avariado no pátio  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar da viagem' }));
    expect(onConfirm).toHaveBeenCalledWith('Cilindro avariado no pátio');
  });

  it('Escape e Cancelar fecham sem retirar', () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('devolve o foco ao acionador ao fechar', () => {
    const { trigger, unmount } = setup();
    unmount();
    expect(trigger).toHaveFocus();
  });

  it('mostra o erro do servidor dentro do diálogo e o botão fica ocupado', () => {
    setup({ error: 'Não foi possível retirar o cilindro.', busy: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível retirar o cilindro.');
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
  });
});

