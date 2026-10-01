import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from './connectivity-context';
import { InitializationGate } from './initialization-gate';
import type { ResolutionResult } from '@/infrastructure/supabase/connection-state';

function renderGate(result: ResolutionResult, reconnect = vi.fn(async () => undefined)) {
  const value: ConnectivityContextValue = {
    result, client: null, config: null, reconnect, reportOperationalError: vi.fn(),
  };
  render(
    <ConnectivityContext.Provider value={value}>
      <InitializationGate><p>Conteúdo do aplicativo</p></InitializationGate>
    </ConnectivityContext.Provider>,
  );
  return { reconnect };
}

describe('InitializationGate', () => {
  it.each(['idle', 'probing'] as const)('não libera o aplicativo enquanto a conexão está em %s', (state) => {
    renderGate({ ...initialResult, state });
    expect(screen.queryByText('Conteúdo do aplicativo')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/conectando/i);
  });

  it.each(['connected', 'degraded'] as const)('libera o aplicativo quando o estado é %s', (state) => {
    renderGate({ state, selectedEndpoint: state === 'connected' ? 'cloud' : 'lan', attempts: [] });
    expect(screen.getByText('Conteúdo do aplicativo')).toBeInTheDocument();
  });

  it.each(['offline', 'blocked'] as const)('mantém o shell disponível em %s, sem simular conexão', (state) => {
    renderGate({ state, attempts: [] });
    expect(screen.getByText('Conteúdo do aplicativo')).toBeInTheDocument();
  });

  it('oferece nova tentativa ligada à reconexão quando a conexão demora além do teto', async () => {
    vi.useFakeTimers();
    try {
      const { reconnect } = renderGate({ ...initialResult, state: 'probing' });
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
      expect(reconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('não desmonta o aplicativo em uma nova sondagem depois da liberação inicial', () => {
    const base = { client: null, config: null, reconnect: vi.fn(async () => undefined), reportOperationalError: vi.fn() };
    const wrap = (result: ResolutionResult) => (
      <ConnectivityContext.Provider value={{ ...base, result }}>
        <InitializationGate><button type="button">Reconectar</button></InitializationGate>
      </ConnectivityContext.Provider>
    );
    const { rerender } = render(wrap({ state: 'offline', attempts: [] }));
    const button = screen.getByRole('button', { name: 'Reconectar' });
    button.focus();
    rerender(wrap({ state: 'probing', attempts: [] }));
    expect(screen.getByRole('button', { name: 'Reconectar' })).toBe(button);
    expect(button).toHaveFocus();
    expect(screen.queryByText(/conectando à nuvem/i)).not.toBeInTheDocument();
  });
});
