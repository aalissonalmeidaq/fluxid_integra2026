import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import type { TripItemView } from '@/application/trips/trip-views';
import { detail } from '../trip-test-support';
import { UnlockDialog } from './unlock-dialog';

const base = detail().items[0]!;
const delivered: TripItemView = { ...base, itemStatus: 'delivered', lockStatus: 'locked' };
const inTransit: TripItemView = { ...base, itemStatus: 'in_transit', lockStatus: 'locked' };

const withAuth = (aal: 'aal1' | 'aal2', ui: React.ReactElement): React.ReactElement => {
  const value: AuthContextValue = { state: { status: 'authenticated', aal }, login: async () => ({ kind: 'unavailable' }), logout: async () => undefined, confirmMfa: async () => false, mfa: null };
  return <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>;
};
const setup = (item: TripItemView, aal: 'aal1' | 'aal2' = 'aal1', over: Partial<React.ComponentProps<typeof UnlockDialog>> = {}) => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  const handlers = { onCancel: vi.fn(), onConfirm: vi.fn() };
  const view = render(withAuth(aal, <UnlockDialog item={item} busy={false} error={null} returnFocusTo={trigger} {...handlers} {...over} />));
  return { ...handlers, trigger, unmount: view.unmount };
};

describe('desbloqueio normal (cilindro entregue)', () => {
  it('mostra o aviso de registro lógico e a Fase 6', () => {
    setup(delivered);
    expect(screen.getByRole('dialog', { name: 'Registrar desbloqueio · CIL-001' })).toBeInTheDocument();
    expect(screen.getByText('Registro lógico')).toBeInTheDocument();
    expect(screen.getByText(/comandada e confirmada pelo dispositivo na Fase 6/)).toBeInTheDocument();
    expect(screen.getByText(/não muda a situação da entrega e não pode ser desfeito/)).toBeInTheDocument();
  });

  it('a justificativa é opcional e o foco começa nela', () => {
    const { onConfirm } = setup(delivered);
    expect(screen.getByLabelText('Justificativa (opcional)')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar desbloqueio' }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it('envia a justificativa limpa quando existe', () => {
    const { onConfirm } = setup(delivered);
    fireEvent.change(screen.getByLabelText('Justificativa (opcional)'), { target: { value: '  Cliente retirou  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar desbloqueio' }));
    expect(onConfirm).toHaveBeenCalledWith('Cliente retirou');
  });

  it('não pede o segundo fator', () => {
    setup(delivered, 'aal1');
    expect(screen.queryByText('Verificação em duas etapas')).not.toBeInTheDocument();
  });
});

describe('desbloqueio excepcional (cilindro em trânsito ou não entregue)', () => {
  it('sem segundo fator mostra a verificação em duas etapas antes da justificativa', () => {
    const { onConfirm } = setup(inTransit, 'aal1');
    expect(screen.getByRole('dialog', { name: 'Desbloqueio excepcional · CIL-001' })).toBeInTheDocument();
    expect(screen.getByText(/exige a verificação em duas etapas antes da justificativa/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('com o segundo fator pede a justificativa obrigatória', () => {
    const { onConfirm } = setup(inTransit, 'aal2');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar desbloqueio excepcional' }));
    expect(screen.getByText(/Explique em 5 a 500 caracteres/)).toBeInTheDocument();
    expect(screen.getByLabelText('Justificativa')).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Cilindro precisa voltar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar desbloqueio excepcional' }));
    expect(onConfirm).toHaveBeenCalledWith('Cilindro precisa voltar');
  });

  it('mostra o erro do servidor dentro do diálogo e o botão fica ocupado', () => {
    setup(inTransit, 'aal2', { error: 'O desbloqueio excepcional exige a verificação em duas etapas.', busy: true });
    expect(screen.getByRole('alert')).toHaveTextContent('exige a verificação em duas etapas');
    expect(screen.getByRole('button', { name: 'Registrando…' })).toHaveAttribute('aria-busy', 'true');
  });

  it('Escape fecha e devolve o foco ao acionador', () => {
    const { onCancel, trigger, unmount } = setup(inTransit, 'aal2');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();
    expect(trigger).toHaveFocus();
  });
});
