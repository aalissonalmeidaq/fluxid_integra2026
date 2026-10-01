import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthProvider } from './auth-provider';
import { useAuth } from './auth-context';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import type { SessionCheck, SessionService } from '@/application/identity/session-service';
import type { MfaService } from '@/application/identity/mfa-service';

function Probe() {
  const { state, login, logout, confirmMfa } = useAuth();
  return (
    <div>
      <span data-testid="state">{JSON.stringify(state)}</span>
      <button onClick={() => void login({ email: 'a@b.co', password: 'x' })}>login</button>
      <button onClick={() => void logout()}>logout</button>
      <button onClick={() => void confirmMfa()}>confirm</button>
    </div>
  );
}

function services(check: SessionCheck | (() => Promise<SessionCheck>) = { kind: 'missing' }) {
  const service = {
    check: vi.fn(typeof check === 'function' ? check : async () => check),
    login: vi.fn(async () => ({ kind: 'authenticated' as const })),
    logout: vi.fn(async () => undefined),
  } as unknown as SessionService;
  return { service, mfa: {} as MfaService };
}

const connectivityProbe = { reconnect: vi.fn(), reportOperationalError: vi.fn() };

function renderProvider(s: ReturnType<typeof services> | null, connectivityState: ConnectivityContextValue['result']['state'] = 'connected', heartbeatMs = 1000) {
  const value: ConnectivityContextValue = {
    result: { ...initialResult, state: connectivityState }, client: null, config: null, ...connectivityProbe,
  };
  return render(
    <ConnectivityContext.Provider value={value}>
      <AuthProvider services={s} heartbeatMs={heartbeatMs}><Probe /></AuthProvider>
    </ConnectivityContext.Provider>,
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent!) as Record<string, unknown>;
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers();
  connectivityProbe.reconnect.mockClear();
  connectivityProbe.reportOperationalError.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('AuthProvider: verificação da sessão para os gates de sincronização', () => {
  function VerifyProbe({ onResult }: { onResult: (value: boolean | undefined) => void }) {
    const { verifySession } = useAuth();
    return <button onClick={() => void (verifySession?.() ?? Promise.resolve(undefined)).then(onResult)}>verificar</button>;
  }

  async function verifyWith(s: ReturnType<typeof services> | null) {
    const onResult = vi.fn();
    const value: ConnectivityContextValue = { result: { ...initialResult, state: 'connected' }, client: null, config: null, ...connectivityProbe };
    render(
      <ConnectivityContext.Provider value={value}>
        <AuthProvider services={s}><VerifyProbe onResult={onResult} /></AuthProvider>
      </ConnectivityContext.Provider>,
    );
    await flush();
    fireEvent.click(screen.getByText('verificar'));
    await flush();
    return onResult;
  }

  it('confirma somente sessão ativa no servidor, sem exigir novo login', async () => {
    const onResult = await verifyWith(services({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false }));
    expect(onResult).toHaveBeenCalledWith(true);
  });

  it.each([
    [{ kind: 'expired', reason: 'timebox' }],
    [{ kind: 'revoked' }],
    [{ kind: 'missing' }],
    [{ kind: 'unreachable' }],
  ] as const)('não confirma sessão %j', async (check) => {
    expect(await verifyWith(services(check))).toHaveBeenCalledWith(false);
  });

  it('não confirma quando o serviço lança exceção', async () => {
    const s = services({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false });
    // A primeira chamada é a restauração ao montar; a falha ocorre na verificação pedida pelo gate.
    (s.service.check as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false })
      .mockRejectedValueOnce(new Error('offline'));
    expect(await verifyWith(s)).toHaveBeenCalledWith(false);
  });

  it('não confirma sem serviço de sessão (destino indisponível)', async () => {
    expect(await verifyWith(null)).toHaveBeenCalledWith(false);
  });
});

describe('AuthProvider: restauração da sessão', () => {
  it('começa verificando e libera somente sessão ativa confirmada pelo servidor', async () => {
    const s = services({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false });
    renderProvider(s);
    expect(state()).toEqual({ status: 'checking' });
    await flush();
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it('perfil global restaurado em AAL1 continua limitado ao fluxo MFA', async () => {
    renderProvider(services({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: true }));
    await flush();
    expect(state()).toEqual({ status: 'mfa_required' });
  });

  it.each([
    [{ kind: 'missing' }, { status: 'signed_out' }],
    [{ kind: 'expired', reason: 'inactivity' }, { status: 'signed_out', notice: 'session_expired', reason: 'inactivity' }],
    [{ kind: 'revoked' }, { status: 'signed_out', notice: 'session_revoked' }],
    [{ kind: 'unreachable' }, { status: 'signed_out' }],
  ] as const)('resultado %j conduz a %j sem conceder acesso', async (check, expected) => {
    renderProvider(services(check as SessionCheck));
    await flush();
    expect(state()).toEqual(expected);
  });

  it('mantém a verificação enquanto a conectividade ainda resolve e nega quando não há cliente', async () => {
    const { unmount } = renderProvider(null, 'probing');
    await flush();
    expect(state()).toEqual({ status: 'checking' });
    unmount();
    renderProvider(null, 'offline');
    await flush();
    expect(state()).toEqual({ status: 'signed_out' });
  });
});

describe('AuthProvider: ações', () => {
  it('login autenticado e MFA atualizam o estado', async () => {
    const s = services({ kind: 'missing' });
    renderProvider(s);
    await flush();
    (s.service.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'authenticated' });
    fireEvent.click(screen.getByText('login'));
    await flush();
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it('login de perfil global fica em mfa_required', async () => {
    const s = services({ kind: 'missing' });
    renderProvider(s);
    await flush();
    (s.service.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'mfa_required' });
    fireEvent.click(screen.getByText('login'));
    await flush();
    expect(state()).toEqual({ status: 'mfa_required' });
  });

  it('falhas de login não alteram o estado autenticado', async () => {
    const s = services({ kind: 'missing' });
    renderProvider(s);
    await flush();
    (s.service.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'session_limit', sessions: [] });
    fireEvent.click(screen.getByText('login'));
    await flush();
    expect(state()).toEqual({ status: 'signed_out' });
  });

  it('logout revoga no servidor e volta a uma área pública com aviso', async () => {
    const s = services({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false });
    renderProvider(s);
    await flush();
    fireEvent.click(screen.getByText('logout'));
    await flush();
    expect(s.service.logout).toHaveBeenCalledTimes(1);
    expect(state()).toEqual({ status: 'signed_out', notice: 'signed_out' });
  });

  it('confirmMfa só libera quando o servidor comprova AAL2', async () => {
    const s = services({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: true });
    renderProvider(s);
    await flush();
    (s.service.check as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: true });
    fireEvent.click(screen.getByText('confirm'));
    await flush();
    expect(state()).toEqual({ status: 'mfa_required' });

    (s.service.check as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'active', aal: 'aal2', expiresAt: 'x', mfaRequired: false });
    fireEvent.click(screen.getByText('confirm'));
    await flush();
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal2' });
  });
});

describe('AuthProvider: atividade e expiração', () => {
  it('confirma a sessão no servidor apenas quando houve atividade do usuário', async () => {
    const s = services({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false });
    renderProvider(s);
    await flush();
    expect(s.service.check).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(s.service.check).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'a' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(s.service.check).toHaveBeenCalledTimes(2);
  });

  it('expiração detectada em segundo plano derruba o acesso com aviso', async () => {
    const check = vi.fn()
      .mockResolvedValueOnce({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false })
      .mockResolvedValue({ kind: 'expired', reason: 'timebox' });
    const s = services(check);
    renderProvider(s);
    await flush();
    fireEvent.pointerDown(document);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(state()).toEqual({ status: 'signed_out', notice: 'session_expired', reason: 'timebox' });
  });

  it('falha de rede durante a sessão não a encerra nem a estende', async () => {
    const check = vi.fn()
      .mockResolvedValueOnce({ kind: 'active', aal: 'aal1', expiresAt: 'x', mfaRequired: false })
      .mockResolvedValue({ kind: 'unreachable' });
    renderProvider(services(check));
    await flush();
    fireEvent.keyDown(document, { key: 'a' });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(state()).toEqual({ status: 'authenticated', aal: 'aal1' });
  });

  it('não confirma sessão enquanto o usuário está deslogado', async () => {
    const s = services({ kind: 'missing' });
    renderProvider(s);
    await flush();
    fireEvent.keyDown(document, { key: 'a' });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(s.service.check).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider: falhas de autenticação não acionam fallback de endpoint (RF-033)', () => {
  it.each([
    [{ kind: 'expired', reason: 'timebox' }],
    [{ kind: 'revoked' }],
    [{ kind: 'missing' }],
    [{ kind: 'unreachable' }],
  ] as const)('resultado %j não reporta erro operacional nem força reconexão', async (check) => {
    renderProvider(services(check as SessionCheck));
    await flush();
    expect(connectivityProbe.reportOperationalError).not.toHaveBeenCalled();
    expect(connectivityProbe.reconnect).not.toHaveBeenCalled();
  });

  it('falha de login também não aciona a conectividade', async () => {
    const s = services({ kind: 'missing' });
    renderProvider(s);
    await flush();
    (s.service.login as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'invalid_credentials' });
    fireEvent.click(screen.getByText('login'));
    await flush();
    expect(connectivityProbe.reportOperationalError).not.toHaveBeenCalled();
    expect(connectivityProbe.reconnect).not.toHaveBeenCalled();
  });
});
