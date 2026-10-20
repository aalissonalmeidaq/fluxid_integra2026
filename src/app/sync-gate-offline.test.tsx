import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from './auth/auth-context';
import { SyncContext, type SyncRunner } from './sync-context';
import { SyncGate } from './sync-gate';
import type { AuthState } from '@/domain/identity/session';
import type { SyncRunResult } from '@/infrastructure/synchronization/sync-coordinator';

// Spec 010, T086 (RF-016a, RF-028): com a sessão restaurada offline não há executor de sincronização (o TenantProvider não o cria), então o portão
// não bloqueia a área protegida. Quando o servidor volta e a sessão é reconfirmada, o executor existe de novo e o portão sincroniza (push antes de pull)
// e confirma sessão e tenant ANTES de liberar: é o que reconfirma tudo antes de a fila ser enviada.
const offline: AuthState = { status: 'authenticated', aal: 'aal1', offline: true };
const online: AuthState = { status: 'authenticated', aal: 'aal1' };
const authValue = (state: AuthState): AuthContextValue => ({ state, login: vi.fn(), logout: vi.fn(async () => undefined), });
const ready = async (): Promise<SyncRunResult> => ({ state: 'ready' });

const tree = (state: AuthState, createRunner: (() => SyncRunner) | null) => (
  <AuthContext.Provider value={authValue(state)}>
    <SyncContext.Provider value={{ createRunner, resolving: false }}><SyncGate><p>Área protegida</p></SyncGate></SyncContext.Provider>
  </AuthContext.Provider>
);

describe('SyncGate com a sessão restaurada offline', () => {
  it('libera a área protegida sem executor de sincronização', () => {
    render(tree(offline, null));
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
  });

  it('com a sessão comum e um executor, bloqueia até sincronizar (nada muda online)', async () => {
    let finish: (value: SyncRunResult) => void = () => undefined;
    const run = vi.fn(() => new Promise<SyncRunResult>((resolve) => { finish = resolve; }));
    render(tree(online, () => ({ run })));
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
    finish(await ready());
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
  });

  it('da sessão offline para a reconfirmada, o portão passa a exigir a sincronização antes de liberar', async () => {
    const view = render(tree(offline, null));
    expect(screen.getByText('Área protegida')).toBeInTheDocument();
    let finish: (value: SyncRunResult) => void = () => undefined;
    const run = vi.fn(() => new Promise<SyncRunResult>((resolve) => { finish = resolve; }));
    view.rerender(tree(online, () => ({ run })));
    expect(screen.queryByText('Área protegida')).not.toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
    finish(await ready());
    expect(await screen.findByText('Área protegida')).toBeInTheDocument();
  });
});
