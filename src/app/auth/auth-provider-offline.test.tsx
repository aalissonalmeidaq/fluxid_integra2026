import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from './auth-provider';
import { useAuth } from './auth-context';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import type { SessionCheck, SessionService } from '@/application/identity/session-service';
import { buildOfflineAccess } from '@/domain/identity/offline-access';

// Spec 010, T085 (RF-016a, CA-006; research.md §19a): com o servidor inalcançável na abertura, a sessão volta pelo registro de acesso offline (menos de 8
// horas); com o servidor respondendo, nada muda e o registro acompanha a vida da sessão.
const NOW = new Date('2026-10-12T12:00:00Z');
const confirmedAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
const record = (hours = 1, over: Record<string, unknown> = {}) => ({
  ...buildOfflineAccess({ actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A', organizationKind: 'tenant', endpointId: 'local', aal: 'aal1', displayName: 'Administrador A', permissions: ['trip.operate'], confirmedAt: confirmedAgo(hours) }),
  ...over,
});

function Probe() {
  const { state, logout, offlineAccess } = useAuth();
  return (
    <div>
      <span data-testid="state">{JSON.stringify(state)}</span>
      <span data-testid="offline">{JSON.stringify(offlineAccess)}</span>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

const services = (check: SessionCheck | (() => Promise<SessionCheck>)) => ({
  service: {
    check: vi.fn(typeof check === 'function' ? check : async () => check),
    login: vi.fn(async () => ({ kind: 'authenticated' as const })),
    logout: vi.fn(async () => undefined),
  } as unknown as SessionService,
  });
const store = (stored: unknown) => ({ read: vi.fn(async () => stored), clear: vi.fn(async () => undefined), save: vi.fn(async () => true) });

function renderProvider(s: ReturnType<typeof services> | null, offlineStore: ReturnType<typeof store> | null, connectivity: ConnectivityContextValue['result']['state'] = 'connected') {
  const value: ConnectivityContextValue = { result: { ...initialResult, state: connectivity }, client: null, config: null, reconnect: vi.fn(), reportOperationalError: vi.fn() };
  return render(
    <ConnectivityContext.Provider value={value}>
      <AuthProvider services={s} offlineAccess={offlineStore} now={() => NOW}><Probe /></AuthProvider>
    </ConnectivityContext.Provider>,
  );
}
const state = () => JSON.parse(screen.getByTestId('state').textContent!) as Record<string, unknown>;
const offlineValue = () => JSON.parse(screen.getByTestId('offline').textContent!) as Record<string, unknown> | null;
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('abertura com o servidor inalcançável', () => {
  it('com registro válido (1 hora), restaura a sessão com a marca offline e expõe o registro', async () => {
    renderProvider(services({ kind: 'unreachable' }), store(record(1)));
    await flush();
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal1', offline: true });
    expect(offlineValue()).toMatchObject({ actorId: 'user-1', organizationId: 'tenant-a', permissions: ['trip.operate'] });
  });

  it('o nível aal2 da última confirmação vale offline', async () => {
    renderProvider(services({ kind: 'unreachable' }), store(record(1, { aal: 'aal2' })));
    await flush();
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal2', offline: true });
  });

  it('sem nenhum servidor alcançável (sem destino), também restaura', async () => {
    renderProvider(null, store(record(1)), 'offline');
    await flush();
    expect(state()).toMatchObject({ status: 'authenticated', offline: true });
  });

  it('sem registro, segue como sempre: entrada', async () => {
    renderProvider(services({ kind: 'unreachable' }), store(null));
    await flush();
    expect(state()).toEqual({ status: 'signed_out' });
    expect(offlineValue()).toBeNull();
  });

  it('com 8 horas ou mais, não restaura, avisa que a sessão expirou e apaga o registro', async () => {
    const s = store(record(8));
    renderProvider(services({ kind: 'unreachable' }), s);
    await flush();
    expect(state()).toEqual({ status: 'signed_out', notice: 'session_expired', reason: 'timebox' });
    expect(s.clear).toHaveBeenCalled();
  });

  it('registro adulterado não restaura nada', async () => {
    renderProvider(services({ kind: 'unreachable' }), store({ version: 1, actorId: 'x' }));
    await flush();
    expect(state()).toEqual({ status: 'signed_out' });
  });

  it('sem armazenamento do acesso offline configurado, nada muda', async () => {
    renderProvider(services({ kind: 'unreachable' }), null);
    await flush();
    expect(state()).toEqual({ status: 'signed_out' });
  });
});

describe('com o servidor respondendo, nada muda', () => {
  it('sessão ativa: autenticada sem marca offline, sem tocar no registro', async () => {
    const s = store(record(1));
    renderProvider(services({ kind: 'active', aal: 'aal1', expiresAt: '2026-10-12T20:00:00Z' }), s);
    await flush();
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal1' });
    expect(offlineValue()).toBeNull();
    expect(s.read).not.toHaveBeenCalled();
    expect(s.clear).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'expired' } as SessionCheck], [{ kind: 'revoked' } as SessionCheck], [{ kind: 'missing' } as SessionCheck],
  ])('sessão %j: o registro é apagado (o aparelho deixa de abrir offline)', async (check) => {
    const s = store(record(1));
    renderProvider(services(check), s);
    await flush();
    expect(s.clear).toHaveBeenCalled();
    expect(state().status).toBe('signed_out');
  });

  it('sair da conta apaga o registro', async () => {
    const s = store(record(1));
    renderProvider(services({ kind: 'active', aal: 'aal1', expiresAt: '2026-10-12T20:00:00Z' }), s);
    await flush();
    fireEvent.click(screen.getByText('logout'));
    await flush();
    expect(s.clear).toHaveBeenCalled();
    expect(state()).toEqual({ status: 'signed_out', notice: 'signed_out' });
  });
});

describe('a volta da conexão', () => {
  it('a confirmação do servidor troca a sessão offline por uma comum e limpa o registro exposto', async () => {
    let reachable = false;
    const s = services(async () => (reachable ? { kind: 'active', aal: 'aal1', expiresAt: '2026-10-12T20:00:00Z' } : { kind: 'unreachable' }));
    const offlineStore = store(record(1));
    const value = (n: number): ConnectivityContextValue => ({ result: { ...initialResult, state: 'connected', selectedEndpoint: n === 0 ? null : 'local' } as never, client: null, config: null, reconnect: vi.fn(), reportOperationalError: vi.fn() });
    const tree = (n: number) => (
      <ConnectivityContext.Provider value={value(n)}>
        <AuthProvider services={n === 0 ? s : { ...s }} offlineAccess={offlineStore} now={() => NOW}><Probe /></AuthProvider>
      </ConnectivityContext.Provider>
    );
    const view = render(tree(0));
    await flush();
    expect(state()).toMatchObject({ offline: true });
    reachable = true;
    view.rerender(tree(1));
    await flush();
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal1' });
    expect(offlineValue()).toBeNull();
  });
});
