import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectivityStatus } from './ConnectivityStatus';
import { ResolutionResult } from '@/infrastructure/supabase/connection-state';
import { MOCK_KEYS } from '@/test/fixtures/connectivity';

describe('Indicador de Conectividade (ConnectivityStatus Component)', () => {
  it('apresenta estado probing com texto acessível', () => {
    const result: ResolutionResult = {
      state: 'probing',
      attempts: [],
    };

    render(<ConnectivityStatus result={result} />);
    const statusElement = screen.getByRole('status');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveTextContent(/verificando|sondando/i);
  });

  it('apresenta estado connected com identificação do destino', () => {
    const result: ResolutionResult = {
      state: 'connected',
      selectedEndpoint: 'local',
      attempts: [{ endpoint: 'local', startedAt: 0, durationMs: 10, outcome: 'success', statusCode: 200 }],
    };

    render(<ConnectivityStatus result={result} />);
    expect(screen.getByText(/conectado/i)).toBeInTheDocument();
    expect(screen.getByText(/local/i)).toBeInTheDocument();
  });

  it('apresenta estado degraded identificando contingência e destino', () => {
    const result: ResolutionResult = {
      state: 'degraded',
      selectedEndpoint: 'lan',
      attempts: [
        { endpoint: 'local', startedAt: 0, durationMs: 2000, outcome: 'timeout' },
        { endpoint: 'lan', startedAt: 2000, durationMs: 15, outcome: 'success', statusCode: 200 },
      ],
    };

    render(<ConnectivityStatus result={result} />);
    expect(screen.getByText(/degradado|contingência|fallback/i)).toBeInTheDocument();
    expect(screen.getByText(/lan|rede local/i)).toBeInTheDocument();
  });

  it('não expõe valores de chaves em nenhum texto ou atributo', () => {
    const result: ResolutionResult = {
      state: 'connected',
      selectedEndpoint: 'local',
      attempts: [{ endpoint: 'local', startedAt: 0, durationMs: 10, outcome: 'success', statusCode: 200 }],
    };

    const { container } = render(<ConnectivityStatus result={result} />);
    const html = container.innerHTML;

    expect(html).not.toContain(MOCK_KEYS.local);
    expect(html).not.toContain(MOCK_KEYS.lan);
    expect(html).not.toContain(MOCK_KEYS.cloud);
  });
});
