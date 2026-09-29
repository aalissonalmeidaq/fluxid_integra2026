import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Providers } from './providers';
import { useConnectivity } from './connectivity-context';
import { createValidEnv } from '@/test/fixtures/environment';

function TestConsumer(): React.JSX.Element {
  const { result, client, reconnect, reportOperationalError } = useConnectivity();
  return (
    <div>
      <span data-testid="state">{result.state}</span>
      <span data-testid="endpoint">{result.selectedEndpoint ?? 'none'}</span>
      <span data-testid="client">{client ? 'active' : 'none'}</span>
      <span data-testid="outcome">{result.attempts.at(-1)?.outcome ?? 'none'}</span>
      <button
        type="button"
        onClick={() => reportOperationalError({ statusCode: 401, code: 'PGRST301' } as never)}
      >
        Simular Erro Operacional
      </button>
      <button type="button" onClick={() => void reconnect()}>
        Reconectar
      </button>
      <button type="button" onClick={() => reportOperationalError({ networkError: true })}>
        Simular Falha de Rede
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
    expect(screen.getByTestId('client')).toHaveTextContent('active');

    // Simula erro operacional (ex: 401)
    act(() => {
      screen.getByText('Simular Erro Operacional').click();
    });

    expect(screen.getByTestId('state')).toHaveTextContent('blocked');
    expect(screen.getByTestId('endpoint')).toHaveTextContent('local'); // Preservado para diagnóstico
    expect(screen.getByTestId('outcome')).toHaveTextContent('authentication');
    expect(screen.getByTestId('client')).toHaveTextContent('none');
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
    expect(screen.getByTestId('client')).toHaveTextContent('active');
  });

  it('descarta o cliente em offline e durante uma nova sondagem', async () => {
    const validEnv = createValidEnv('local');

    render(
      <Providers customEnv={validEnv}>
        <TestConsumer />
      </Providers>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByTestId('client')).toHaveTextContent('active');

    act(() => {
      screen.getByText('Simular Falha de Rede').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('offline');
    expect(screen.getByTestId('client')).toHaveTextContent('none');

    global.fetch = vi.fn(() => new Promise<Response>(() => undefined));
    act(() => {
      screen.getByText('Reconectar').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('probing');
    expect(screen.getByTestId('client')).toHaveTextContent('none');
  });
});
