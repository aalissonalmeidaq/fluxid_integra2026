import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CancelDialog } from './cancel-dialog';
import { ReturnItemDialog } from './return-item-dialog';

const setupCancel = (status: 'planned' | 'loading' | 'in_progress' = 'planned', over: Partial<React.ComponentProps<typeof CancelDialog>> = {}) => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  const handlers = { onCancel: vi.fn(), onConfirm: vi.fn() };
  const view = render(<CancelDialog tripNumber={7} status={status} busy={false} error={null} returnFocusTo={trigger} {...handlers} {...over} />);
  return { ...handlers, trigger, unmount: view.unmount };
};

describe('diálogo de cancelamento', () => {
  it('antes de sair explica que as reservas são liberadas', () => {
    setupCancel('planned');
    expect(screen.getByRole('dialog', { name: 'Cancelar a viagem n.º 7' })).toBeInTheDocument();
    expect(screen.getByText(/Os cilindros reservados ficam livres para outras viagens/)).toBeInTheDocument();
  });

  it('em andamento avisa que o que já saiu continua em trânsito, e que é uma exceção', () => {
    setupCancel('in_progress');
    expect(screen.getByText(/continuam em trânsito até você registrar o retorno ao estoque/)).toBeInTheDocument();
    expect(screen.getByText(/uma exceção/)).toBeInTheDocument();
  });

  it('justificativa obrigatória: erro junto do campo, foco nele e nada enviado', () => {
    const { onConfirm } = setupCancel();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar viagem' }));
    expect(screen.getByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa')).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirma com a justificativa limpa', () => {
    const { onConfirm } = setupCancel();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: '  Cliente desistiu da entrega  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar viagem' }));
    expect(onConfirm).toHaveBeenCalledWith('Cliente desistiu da entrega');
  });

  it('"Cancelar" e Escape fecham sem cancelar a viagem e devolvem o foco', () => {
    const { onCancel, onConfirm, trigger, unmount } = setupCancel();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    unmount();
    expect(trigger).toHaveFocus();
  });

  it('mostra o erro do servidor dentro do diálogo', () => {
    setupCancel('in_progress', { error: 'Você não tem permissão para esta ação.', busy: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Você não tem permissão para esta ação.');
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
  });
});

describe('diálogo de retorno ao estoque', () => {
  const setup = (over: Partial<React.ComponentProps<typeof ReturnItemDialog>> = {}) => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const handlers = { onCancel: vi.fn(), onConfirm: vi.fn() };
    render(<ReturnItemDialog serialNumber="CIL-002" busy={false} error={null} returnFocusTo={trigger} {...handlers} {...over} />);
    return handlers;
  };

  it('é um diálogo com o cilindro no título e explica o efeito', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Devolver CIL-002 ao estoque' })).toBeInTheDocument();
    expect(screen.getByText(/volta à organização, em estoque/)).toBeInTheDocument();
  });

  it('exige a justificativa e envia limpa', () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Devolver ao estoque' }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: ' Cliente não aceitou ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Devolver ao estoque' }));
    expect(onConfirm).toHaveBeenCalledWith('Cliente não aceitou');
  });
});
