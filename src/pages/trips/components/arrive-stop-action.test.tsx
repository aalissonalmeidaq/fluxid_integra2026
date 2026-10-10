import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArriveStopAction } from './arrive-stop-action';

const setup = (over: Partial<React.ComponentProps<typeof ArriveStopAction>> = {}) => {
  const onArrive = vi.fn();
  render(<ArriveStopAction position={2} siteName="Unidade Norte" online busy={false} loading={false} onArrive={onArrive} {...over} />);
  return onArrive;
};

describe('registrar chegada', () => {
  it('tem nome acessível com a parada e a unidade e chama a ação', () => {
    const onArrive = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar chegada à parada 2 (Unidade Norte)' }));
    expect(onArrive).toHaveBeenCalledTimes(1);
  });

  it('sem conexão ou com outra ação em andamento fica desabilitado', () => {
    setup({ online: false });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('enquanto registra mostra o carregando e não aceita novo clique', () => {
    const onArrive = setup({ loading: true });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    expect(onArrive).not.toHaveBeenCalled();
  });
});
