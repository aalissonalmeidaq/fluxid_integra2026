import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReceivingWindowField } from './receiving-window-field';

describe('ReceivingWindowField (RF-005)', () => {
  const base = { days: [1, 2], from: '08:00', to: '17:00' };

  it('mostra os sete dias, marca os escolhidos e os horários', () => {
    render(<ReceivingWindowField value={base} onChange={() => undefined} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(7);
    expect(screen.getByRole('checkbox', { name: 'Segunda' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Domingo' })).not.toBeChecked();
    expect(screen.getByLabelText('Das')).toHaveValue('08:00');
    expect(screen.getByLabelText('Às')).toHaveValue('17:00');
  });

  it('marcar um dia entrega os dias em ordem; desmarcar remove', () => {
    const onChange = vi.fn();
    render(<ReceivingWindowField value={base} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Domingo' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...base, days: [0, 1, 2] });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Segunda' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...base, days: [2] });
  });

  it('alterar o horário preserva os dias', () => {
    const onChange = vi.fn();
    render(<ReceivingWindowField value={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Das'), { target: { value: '09:30' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, from: '09:30' });
    fireEvent.change(screen.getByLabelText('Às'), { target: { value: '18:00' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...base, to: '18:00' });
  });

  it('o erro aparece junto do grupo e liga ao fieldset', () => {
    render(<ReceivingWindowField value={base} onChange={() => undefined} error="O horário final deve ser depois do inicial." />);
    expect(screen.getByRole('group', { name: 'Horário de recebimento' })).toHaveAttribute('aria-describedby', 'receiving-window-error');
    expect(screen.getByText('O horário final deve ser depois do inicial.')).toBeInTheDocument();
    expect(screen.getByLabelText('Das')).toHaveAttribute('aria-invalid', 'true');
  });

  it('desabilitado, bloqueia todos os controles', () => {
    render(<ReceivingWindowField value={base} onChange={() => undefined} disabled />);
    expect(screen.getByRole('checkbox', { name: 'Segunda' })).toBeDisabled();
    expect(screen.getByLabelText('Das')).toBeDisabled();
  });
});
