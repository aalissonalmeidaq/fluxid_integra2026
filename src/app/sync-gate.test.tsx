import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from './auth/auth-context';
import { SyncContext, type SyncRunner } from './sync-context';
import { SyncGate } from './sync-gate';
import type { AuthState } from '@/domain/identity/session';
import type { SyncPhase, SyncRunResult } from '@/infrastructure/synchronization/sync-coordinator';

const authenticated: AuthState = { status: 'authenticated', aal: 'aal1' };

function auth(state: AuthState, logout = vi.fn(async () => undefined)): AuthContextValue {
  return { state, login: vi.fn(), logout, confirmMfa: vi.fn(), mfa: null };
}

type Factory = (onPhase: (phase: SyncPhase) => void) => SyncRunner;
const runnerFor = (run: SyncRunner['run']): Factory => () => ({ run });
const ready = async (): Promise<SyncRunResult> => ({ state: 'ready' });

function renderGate(state: AuthState, createRunner: Factory | null, logout = vi.fn(async () => undefined), resolving = false) {
  const tree = (value: AuthState, factory: Factory | null, isResolving = resolving) => (
    <AuthContext.Provider value={auth(value, logout)}>
      <SyncContext.Provider value={{ createRunner: factory, resolving: isResolving }}>
        <SyncGate><p>Área protegida</p></SyncGate>
      </SyncContext.Provider>
    </AuthContext.Provider>
  );
  const view = render(tree(state, createRunner));
  return { ...view, rerenderWith: (next: AuthState, factory: Factory | null = createRunner, isResolving = resolving) => view.rerender(tree(next, factory, isResolving)), logout };
}

describe('SyncGate', () => {
  it.each([
    [{ status: 'signed_out' } as AuthState],
    [{ status: 'checking' } as AuthState],
    [{ status: 'mfa_required' } as AuthState],
  ])('não sincroniza nem bloqueia sem sessão autenticada (%j)', (state) => {
    const create = vi.fn(runnerFor(ready));
    renderGate(state, create);
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('libera a área quando não há o que sincronizar', () => {
    renderGate(authenticated, null);
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
  });

  it('bloqueia a área protegida desde a primeira renderização e a libera ao concluir', async () => {
    let finish!: (result: SyncRunResult) => void;
    const pending = new Promise<SyncRunResult>((resolve) => { finish = resolve; });
    renderGate(authenticated, runnerFor(() => pending));
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => { finish({ state: 'ready' }); });
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
  });

  it('acompanha as fases de push, pull e preparação na tela', async () => {
    let finish!: (result: SyncRunResult) => void;
    const pending = new Promise<SyncRunResult>((resolve) => { finish = resolve; });
    let emit!: (phase: SyncPhase) => void;
    renderGate(authenticated, (onPhase) => { emit = onPhase; return { run: () => pending }; });
    expect(screen.getByRole('status')).toHaveTextContent(/verificando alterações locais/i);
    act(() => emit('pushing'));
    expect(screen.getByRole('status')).toHaveTextContent(/sincronizando alterações/i);
    act(() => emit('pulling'));
    expect(screen.getByRole('status')).toHaveTextContent(/atualizando informações/i);
    act(() => emit('preparing'));
    expect(screen.getByRole('status')).toHaveTextContent(/preparando aplicação/i);
    await act(async () => { finish({ state: 'ready' }); });
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
  });

  it.each([
    [{ state: 'conflict' }, /conflito encontrado/i],
    [{ state: 'session_expired' }, /sessão expirada/i],
    [{ state: 'gate_failed', failedGate: 'session' }, /sessão expirada/i],
    [{ state: 'gate_failed', failedGate: 'tenant' }, /acesso negado/i],
    [{ state: 'gate_failed', failedGate: 'consistency' }, /falha de conexão/i],
    [{ state: 'interrupted' }, /falha de conexão/i],
  ] as const)('mantém a área bloqueada e anuncia o resultado %j', async (result, title) => {
    renderGate(authenticated, runnerFor(async () => result as SyncRunResult));
    expect(await screen.findByRole('alert')).toHaveTextContent(title);
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
  });

  it('trata exceção do executor como falha recuperável, sem liberar a área', async () => {
    renderGate(authenticated, runnerFor(async () => { throw new Error('boom'); }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/falha de conexão/i);
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
  });

  it('repete a sincronização ao tentar novamente e libera quando concluir', async () => {
    const run = vi.fn<SyncRunner['run']>()
      .mockResolvedValueOnce({ state: 'interrupted' })
      .mockResolvedValueOnce({ state: 'ready' });
    renderGate(authenticated, runnerFor(run));
    fireEvent.click(await screen.findByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('com sessão expirada a ação de recuperação encerra a sessão para entrar de novo', async () => {
    const { logout } = renderGate(authenticated, runnerFor(async () => ({ state: 'session_expired' })));
    fireEvent.click(await screen.findByRole('button', { name: /tentar novamente/i }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('executa uma única vez por autenticação e não bloqueia de novo depois de liberar', async () => {
    const run = vi.fn<SyncRunner['run']>(ready);
    const { rerenderWith } = renderGate(authenticated, runnerFor(run));
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
    rerenderWith({ status: 'authenticated', aal: 'aal2' });
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('sincroniza de novo em um novo login depois de sair', async () => {
    const run = vi.fn<SyncRunner['run']>(ready);
    const factory = runnerFor(run);
    const { rerenderWith } = renderGate(authenticated, factory);
    await screen.findByText('Área protegida');
    rerenderWith({ status: 'signed_out', notice: 'signed_out' });
    rerenderWith(authenticated);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('bloqueia de novo e sincroniza o novo contexto quando o executor muda (troca de tenant)', async () => {
    let finish!: (result: SyncRunResult) => void;
    const second = new Promise<SyncRunResult>((resolve) => { finish = resolve; });
    const first = runnerFor(ready);
    const next = runnerFor(() => second);
    const { rerenderWith } = renderGate(authenticated, first);
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
    rerenderWith(authenticated, next);
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await act(async () => { finish({ state: 'ready' }); });
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
  });

  it('bloqueia enquanto o tenant ainda está sendo resolvido, mesmo sem executor, e libera ao resolver', () => {
    const { rerenderWith } = renderGate(authenticated, null, undefined, true);
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/verificando alterações locais/i);
    rerenderWith(authenticated, null, false);
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
  });

  it('não bloqueia por resolução de tenant sem sessão autenticada', () => {
    renderGate({ status: 'signed_out' }, null, undefined, true);
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
  });

  it('oferece recuperação quando a resolução do tenant passa do teto de tempo', async () => {
    vi.useFakeTimers();
    try {
      renderGate(authenticated, null, undefined, true);
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('libera a área quando o executor deixa de existir (sem tenant ativo a sincronizar)', async () => {
    const { rerenderWith } = renderGate(authenticated, runnerFor(async () => new Promise<SyncRunResult>(() => undefined)));
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
    rerenderWith(authenticated, null);
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
  });

  it('cancela a sincronização em andamento ao desmontar', async () => {
    let signal: AbortSignal | undefined;
    const { unmount } = renderGate(authenticated, runnerFor(async (options) => { signal = options?.signal; return new Promise<SyncRunResult>(() => undefined); }));
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
