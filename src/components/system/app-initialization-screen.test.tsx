import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AppInitializationScreen, type InitializationPhase } from './app-initialization-screen';

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

const PROGRESS: Array<[InitializationPhase, RegExp]> = [
  ['inspecting', /verificando alterações locais/i],
  ['connecting', /conectando/i],
  ['pushing', /sincronizando alterações/i],
  ['pulling', /atualizando informações/i],
  ['preparing', /preparando aplicação/i],
  ['completed', /sincronização concluída/i],
];

const BLOCKING: Array<[InitializationPhase, RegExp]> = [
  ['failed', /falha de conexão/i],
  ['conflict', /conflito encontrado/i],
  ['session_expired', /sessão expirada/i],
  ['access_denied', /acesso negado/i],
];

describe('AppInitializationScreen', () => {
  it.each(PROGRESS)('anuncia a fase %s de forma educada em região de status', (phase, text) => {
    render(<AppInitializationScreen phase={phase} onRetry={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(text);
  });

  it.each(BLOCKING)('anuncia %s como alerta e oferece ação de recuperação', (phase, text) => {
    render(<AppInitializationScreen phase={phase} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('move o foco para a mensagem de recuperação em estados bloqueantes', () => {
    render(<AppInitializationScreen phase="session_expired" onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('não oferece nova tentativa durante o progresso normal', () => {
    render(<AppInitializationScreen phase="pushing" onRetry={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('oferece a ação de recuperação após o teto de 30 s', () => {
    render(<AppInitializationScreen phase="connecting" onRetry={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(29_999); });
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/demorando/i);
  });

  it('reinicia o teto ao mudar de fase', () => {
    const { rerender } = render(<AppInitializationScreen phase="connecting" onRetry={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(20_000); });
    rerender(<AppInitializationScreen phase="pushing" onRetry={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('respeita o limite configurável', () => {
    render(<AppInitializationScreen phase="connecting" onRetry={vi.fn()} timeoutMs={5_000} />);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });

  it('não conta o teto na fase concluída', () => {
    render(<AppInitializationScreen phase="completed" onRetry={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('aciona a nova tentativa por um botão nativo, operável por teclado', () => {
    const onRetry = vi.fn();
    render(<AppInitializationScreen phase="failed" onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: /tentar novamente/i });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('tabindex', '-1');
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('usa alvo de toque mínimo de 44 px e foco visível no botão', () => {
    render(<AppInitializationScreen phase="failed" onRetry={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.className).toMatch(/min-h-11/);
    expect(button.className).toMatch(/focus-visible:/);
  });

  it('desativa a animação com movimento reduzido e oculta o indicador dos leitores de tela', () => {
    render(<AppInitializationScreen phase="connecting" onRetry={vi.fn()} />);
    const spinner = document.querySelector('[data-testid="init-spinner"]');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
    expect(spinner!.className).toMatch(/motion-reduce:animate-none/);
  });

  it('identifica o endpoint ativo sem expor URL', () => {
    render(<AppInitializationScreen phase="preparing" endpoint="lan" onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(/rede local/i);
    expect(document.body.textContent).not.toMatch(/https?:\/\//);
  });
});
