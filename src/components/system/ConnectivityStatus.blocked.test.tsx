import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectivityStatus } from './ConnectivityStatus';
import { ResolutionResult } from '@/infrastructure/supabase/connection-state';

describe('ConnectivityStatus: Estados Blocked e Offline (T037)', () => {
  it('apresenta role="alert", mensagem de bloqueio e botão de ação para estado blocked', () => {
    const onReconnect = vi.fn();
    const result: ResolutionResult = {
      state: 'blocked',
      selectedEndpoint: 'local',
      attempts: [
        {
          endpoint: 'local',
          startedAt: 0,
          durationMs: 10,
          outcome: 'configuration',
          statusCode: 401,
        },
      ],
    };

    render(<ConnectivityStatus result={result} onReconnect={onReconnect} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/bloqueada/i);

    const button = screen.getByRole('button', { name: /reconectar/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('apresenta role="alert", mensagem offline e botão para estado offline', () => {
    const onReconnect = vi.fn();
    const result: ResolutionResult = {
      state: 'offline',
      attempts: [
        {
          endpoint: 'local',
          startedAt: 0,
          durationMs: 2000,
          outcome: 'timeout',
        },
      ],
    };

    render(<ConnectivityStatus result={result} onReconnect={onReconnect} />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/offline|sem conexão/i);

    const button = screen.getByRole('button', { name: /reconectar/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
