import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App Shell (História 1)', () => {
  it('renderiza o título do produto FluxID', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('FluxID');
  });

  it('possui região principal semântica', () => {
    render(<App />);
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
  });

  it('não renderiza funcionalidades, cadastros ou dados de domínio', () => {
    render(<App />);
    // Garante ausência de telas, tabelas e regras de negócio de cilindros de gases nesta fundação.
    expect(screen.queryByText(/cadastro de cilindro/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/válvula/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/capacete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lacre/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/viagem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/frota/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('exibe e permite clicar no botão de instalação PWA quando o evento é disparado', async () => {
    const { act } = await import('@testing-library/react');
    const { fireEvent } = await import('@testing-library/react');

    render(<App />);

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const mockEvent = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    mockEvent.prompt = promptMock;
    mockEvent.userChoice = Promise.resolve({ outcome: 'accepted' });

    act(() => {
      window.dispatchEvent(mockEvent);
    });

    const installButton = screen.getByRole('button', { name: /instalar app/i });
    expect(installButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(installButton);
    });

    expect(promptMock).toHaveBeenCalled();
  });

  it('exibe alerta offline quando o dispositivo perde conectividade', async () => {
    const { act } = await import('@testing-library/react');
    render(<App />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText(/modo offline em operação/i)).toBeInTheDocument();
  });
});
