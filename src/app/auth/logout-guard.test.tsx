import { fireEvent, render, renderHook, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogoutGuard } from './logout-guard';
import { useGuardedLogout } from './use-guarded-logout';

// Spec 010, T043 (RF-007, RF-016, CA-006): sair com pendências avisa, e a fila fica no aparelho.
const props = (over: Record<string, unknown> = {}) => ({ pending: 3, online: true, busy: false, message: null, returnFocusTo: null, onSend: vi.fn(), onLeave: vi.fn(), onStay: vi.fn(), ...over });

describe('aviso de saída com pendências', () => {
  it('diz quantas operações não foram enviadas e oferece as três saídas', () => {
    const p = props();
    render(<LogoutGuard {...p} />);
    expect(screen.getByRole('dialog', { name: 'Há registros que ainda não foram enviados' })).toBeInTheDocument();
    expect(screen.getByText(/Há 3 operações que ainda não foram enviadas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar antes de sair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair mesmo assim' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar no aplicativo' }));
    expect(p.onSend).toHaveBeenCalled();
    expect(p.onLeave).toHaveBeenCalled();
    expect(p.onStay).toHaveBeenCalled();
  });

  it('uma só operação usa o singular', () => {
    render(<LogoutGuard {...props({ pending: 1 })} />);
    expect(screen.getByText(/Há 1 operação que ainda não foi enviada/)).toBeInTheDocument();
  });

  it('sem conexão não dá para enviar antes, e o motivo aparece', () => {
    render(<LogoutGuard {...props({ online: false })} />);
    expect(screen.getByRole('button', { name: 'Enviar antes de sair' })).toBeDisabled();
    expect(screen.getByText('Sem conexão: não dá para enviar agora.')).toBeInTheDocument();
  });

  it('explica que sair mantém a fila no aparelho', () => {
    render(<LogoutGuard {...props()} />);
    expect(screen.getByText(/continuam guardadas neste aparelho/)).toBeInTheDocument();
  });

  it('Escape continua no aplicativo', () => {
    const p = props();
    render(<LogoutGuard {...p} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(p.onStay).toHaveBeenCalled();
  });
});

describe('sair com a fila', () => {
  const deps = (over: Record<string, unknown> = {}) => ({
    pendingCount: vi.fn(async () => 0), sendAll: vi.fn(async () => undefined), removeCopies: vi.fn(async () => undefined), logout: vi.fn(async () => undefined), online: true, ...over,
  });

  it('sem pendência: remove só a cópia das viagens e sai, sem aviso', async () => {
    const d = deps();
    const { result } = renderHook(() => useGuardedLogout(d));
    await act(async () => { await result.current.request(); });
    expect(d.removeCopies).toHaveBeenCalled();
    expect(d.logout).toHaveBeenCalled();
    expect(result.current.warning).toBeNull();
  });

  it('com pendência: abre o aviso e não sai', async () => {
    const d = deps({ pendingCount: vi.fn(async () => 2) });
    const { result } = renderHook(() => useGuardedLogout(d));
    await act(async () => { await result.current.request(); });
    expect(result.current.warning).toEqual({ pending: 2 });
    expect(d.logout).not.toHaveBeenCalled();
  });

  it('"sair mesmo assim" sai e tira só a cópia da viagem (a fila fica)', async () => {
    const d = deps({ pendingCount: vi.fn(async () => 2) });
    const { result } = renderHook(() => useGuardedLogout(d));
    await act(async () => { await result.current.request(); });
    await act(async () => { await result.current.leaveAnyway(); });
    expect(d.removeCopies).toHaveBeenCalled();
    expect(d.logout).toHaveBeenCalled();
  });

  it('"enviar antes de sair": envia, e só sai se não restar nada', async () => {
    const counts = [2, 0];
    const d = deps({ pendingCount: vi.fn(async () => counts.shift() ?? 0) });
    const { result } = renderHook(() => useGuardedLogout(d));
    await act(async () => { await result.current.request(); });
    await act(async () => { await result.current.sendFirst(); });
    expect(d.sendAll).toHaveBeenCalled();
    await waitFor(() => expect(d.logout).toHaveBeenCalled());
  });

  it('"enviar antes de sair" com pendência que sobra mantém o aviso, com o texto', async () => {
    const d = deps({ pendingCount: vi.fn(async () => 1) });
    const { result } = renderHook(() => useGuardedLogout(d));
    await act(async () => { await result.current.request(); });
    await act(async () => { await result.current.sendFirst(); });
    expect(d.logout).not.toHaveBeenCalled();
    expect(result.current.warning).toEqual({ pending: 1, message: 'Nem tudo foi enviado. Você pode tentar de novo, sair mesmo assim ou continuar no aplicativo.' });
  });

  it('"continuar no aplicativo" fecha o aviso', async () => {
    const d = deps({ pendingCount: vi.fn(async () => 2) });
    const { result } = renderHook(() => useGuardedLogout(d));
    await act(async () => { await result.current.request(); });
    act(() => result.current.stay());
    expect(result.current.warning).toBeNull();
  });
});
