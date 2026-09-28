import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Providers } from './providers';
import { useConnectivity } from './connectivity-context';
import { createValidEnv } from '@/test/fixtures/environment';

function TestConsumer(): React.JSX.Element {
  const { result, reconnect, reportOperationalError } = useConnectivity();
  return (
    <div>
      <span data-testid="state">{result.state}</span>
      <span data-testid="endpoint">{result.selectedEndpoint ?? 'none'}</span>
      <button type="button" onClick={() => reportOperationalError(401)}>
        Simular Erro Operacional
      </button>
      <button type="button" onClick={() => void reconnect()}>
        Reconectar
      </button>
    </div>
  );
}

describe('Providers & Estabilidade de Sessão (História 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    );
  });

  it('mantém a sessão estável e transita para blocked ao receber erro operacional, sem fallback automático', async () => {
    const validEnv = createValidEnv('local');

    render(
      <Providers customEnv={validEnv}>
        <TestConsumer />
      </Providers>
    );

    // Aguarda o término da resolução
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('state')).toHaveTextContent('connected');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('local');

    // Simula erro operacional (ex: 401)
    act(() => {
      screen.getByText('Simular Erro Operacional').click();
    });

    expect(screen.getByTestId('state')).toHaveTextContent('blocked');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('local'); // Preservado para diagnóstico
  });

  it('permite reiniciar a sondagem exclusivamente por ação explícita de reconexão', async () => {
    const validEnv = createValidEnv('local');

    render(
      <Providers customEnv={validEnv}>
        <TestConsumer />
      </Providers>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    act(() => {
      screen.getByText('Simular Erro Operacional').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('blocked');

    // Aciona reconexão explícita
    await act(async () => {
      screen.getByText('Reconectar').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('state')).toHaveTextContent('connected');
  });
});
