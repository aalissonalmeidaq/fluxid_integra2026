import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReasonDialog } from './reason-dialog';

function setup(props: Partial<React.ComponentProps<typeof ReasonDialog>> = {}) {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(<ReasonDialog title="Desativar identificador" confirmLabel="Confirmar desativação" returnFocusTo={trigger} onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { trigger, onConfirm, onCancel, unmount: view.unmount };
}

describe('ReasonDialog (confirmação acessível com justificativa)', () => {
  it('é um diálogo modal com título e o foco inicial na justificativa', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Desativar identificador' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa')).toHaveFocus();
  });

  it('sem justificativa suficiente: erro junto do campo, foco nele e nada é confirmado', () => {
    const { onConfirm } = setup();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação' }));
    expect(screen.getByText('Explique o motivo com pelo menos 5 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Justificativa')).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirma com a justificativa aparada e os campos extras', () => {
    const { onConfirm } = setup({ children: <input aria-label="Motivo" name="reason" defaultValue="lost" /> });
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: '  Etiqueta danificada  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desativação' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toBe('Etiqueta danificada');
    expect((onConfirm.mock.calls[0]?.[1] as FormData).get('reason')).toBe('lost');
  });

  it('Cancelar e Escape fecham sem confirmar', () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ocupado: botão de confirmar desabilitado e envio ignorado', () => {
    const { onConfirm } = setup({ busy: true });
    expect(screen.getByRole('button', { name: /salvando/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'motivo suficiente' } });
    fireEvent.submit(screen.getByLabelText('Justificativa').closest('form') as HTMLFormElement);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('mostra o erro devolvido pelo servidor como alerta dentro do diálogo', () => {
    setup({ error: 'O valor ainda está ativo em outro cilindro.' });
    expect(screen.getByRole('alert')).toHaveTextContent('O valor ainda está ativo em outro cilindro.');
  });

  it('devolve o foco ao acionador ao fechar', () => {
    const { trigger, unmount } = setup();
    expect(trigger).not.toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
  });
});
