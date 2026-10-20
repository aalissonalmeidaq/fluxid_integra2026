import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LockCommandDialog } from './lock-command-dialog';


// Spec 012 (T071; RF-025, RN-005): travar e destravar pelo cilindro, sempre com justificativa de 5 a 500; destravar pede antes o segundo
// fator, quando a sessão ainda não tem. O texto deixa claro que só a confirmação do lacre muda a trava (RN-001).
const base = { serialNumber: 'CIL-0042', busy: false, error: null, returnFocusTo: null, onCancel: vi.fn() };

describe('LockCommandDialog', () => {
  it('travar: justificativa obrigatória, erro junto do campo e um único envio', () => {
    const onConfirm = vi.fn();
    render(<LockCommandDialog {...base} kind="lock" onConfirm={onConfirm} />);
    expect(screen.getByRole('dialog', { name: 'Travar o lacre · CIL-0042' })).toBeInTheDocument();
    expect(screen.getByText(/só muda quando o lacre confirmar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para travar' }));
    expect(screen.getByText(/pelo menos 5 caracteres/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Cilindro parado no pátio.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para travar' }));
    expect(onConfirm).toHaveBeenCalledWith('Cilindro parado no pátio.');
  });

  it('destravar pede só a justificativa, sem segundo fator (Spec 013, RF-021)', () => {
    const onConfirm = vi.fn();
    render(<LockCommandDialog {...base} kind="unlock" onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Cliente precisa usar agora.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para destravar' }));
    expect(onConfirm).toHaveBeenCalledWith('Cliente precisa usar agora.');
  });

  it('erro do servidor aparece dentro do diálogo', () => {
    render(<LockCommandDialog {...base} kind="lock" error="O cilindro não tem lacre vinculado." onConfirm={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('O cilindro não tem lacre vinculado.');
  });
});
