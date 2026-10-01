import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectivityStatus } from './ConnectivityStatus';
import type { EndpointKind, ResolutionResult } from '@/infrastructure/supabase/connection-state';

const resultFor = (state: ResolutionResult['state'], selectedEndpoint?: EndpointKind): ResolutionResult => ({
  state,
  ...(selectedEndpoint ? { selectedEndpoint } : {}),
  attempts: [],
});

describe('ConnectivityStatus: endpoint ativo e modo degradado (T040)', () => {
  it.each([
    ['cloud', /nuvem/i],
    ['lan', /rede local/i],
    ['local', /dispositivo local/i],
  ] as const)('identifica o endpoint %s ativo', (endpoint, label) => {
    render(<ConnectivityStatus result={resultFor(endpoint === 'cloud' ? 'connected' : 'degraded', endpoint)} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it.each(['lan', 'local'] as const)('sinaliza modo degradado em %s com texto, sem depender de cor', (endpoint) => {
    render(<ConnectivityStatus result={resultFor('degraded', endpoint)} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/modo degradado/i);
    expect(status.querySelector('[data-testid="status-icon"]')).toHaveAttribute('aria-hidden', 'true');
    expect(status.querySelector('[data-testid="status-icon"]')?.textContent).toBeTruthy();
  });

  it('não sinaliza modo degradado quando a cloud está ativa', () => {
    render(<ConnectivityStatus result={resultFor('connected', 'cloud')} />);
    expect(screen.getByRole('status')).not.toHaveTextContent(/degradado/i);
  });

  it('avisa que a confirmação definitiva depende da cloud no modo degradado', () => {
    render(<ConnectivityStatus result={resultFor('degraded', 'lan')} />);
    expect(screen.getByRole('status')).toHaveTextContent(/confirmação definitiva/i);
  });

  it.each([
    ['connected', 'cloud'],
    ['degraded', 'lan'],
    ['probing', undefined],
  ] as const)('mantém área mínima de 44 × 44 px no estado %s', (state, endpoint) => {
    render(<ConnectivityStatus result={resultFor(state, endpoint)} />);
    expect(screen.getByRole('status').className).toMatch(/min-h-(11|alvo)/);
  });

  it('usa ícone distinto por severidade para não depender apenas de cor', () => {
    const icons = (['connected', 'degraded'] as const).map((state) => {
      const { container, unmount } = render(<ConnectivityStatus result={resultFor(state, state === 'connected' ? 'cloud' : 'lan')} />);
      const icon = container.querySelector('[data-testid="status-icon"]')?.textContent;
      unmount();
      return icon;
    });
    expect(icons[0]).toBeTruthy();
    expect(icons[1]).toBeTruthy();
    expect(icons[0]).not.toBe(icons[1]);
  });

  it('não expõe URLs do endpoint', () => {
    const { container } = render(<ConnectivityStatus result={resultFor('degraded', 'lan')} />);
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });
});
