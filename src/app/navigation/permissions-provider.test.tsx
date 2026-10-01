import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import { TenantContext, type TenantContextValue } from '@/app/tenant/tenant-context';
import type { AuthState } from '@/domain/identity/session';
import type { ActorPermissions } from '@/domain/navigation/visible-screens';
import type { PermissionsOutcome, PermissionsService } from '@/application/identity/permissions-service';
import { PermissionsProvider } from './permissions-provider';
import { usePermissions } from './permissions-context';
import { createPermissionsCache } from './permissions-cache';

const A = '20000000-0000-0000-0000-00000000000a';
const B = '20000000-0000-0000-0000-00000000000b';

const ADMIN: ActorPermissions = { tenant: ['audit.read', 'tenant.manage'], global: [] };
const OPERATOR: ActorPermissions = { tenant: [], global: [] };
const success = (value: ActorPermissions): PermissionsOutcome => ({ kind: 'success', value });
const UNAVAILABLE: PermissionsOutcome = { kind: 'unavailable' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function serviceReturning(...outcomes: Array<PermissionsOutcome | Promise<PermissionsOutcome>>) {
  const query = vi.fn<(organizationId: string | null) => Promise<PermissionsOutcome>>();
  outcomes.forEach((outcome) => query.mockImplementationOnce(async () => outcome));
  query.mockImplementation(async () => outcomes[outcomes.length - 1] ?? UNAVAILABLE);
  return { query, service: { query } as unknown as PermissionsService };
}

const authValue = (state: AuthState): AuthContextValue => ({
  state, login: async () => ({ kind: 'unavailable' }), logout: async () => undefined, confirmMfa: async () => false, mfa: null,
});
const tenantValue = (activeOrganizationId: string | null): TenantContextValue => ({
  status: 'ready', selection: { kind: 'none' }, options: [], activeOrganizationId, switching: false,
  select: async () => ({ ok: false, reason: 'unavailable' }), beginSwitch: () => undefined, cancelSwitch: () => undefined, reload: async () => undefined,
});

const renders: string[] = [];
function Probe() {
  const { status, permissions, retry } = usePermissions();
  const codes = permissions ? `${permissions.tenant.join(',')}|${permissions.global.join(',')}` : 'nenhuma';
  renders.push(`${status}:${codes}`);
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="codes">{codes}</span>
      <button onClick={retry}>tentar</button>
    </div>
  );
}

interface HarnessProps {
  service: PermissionsService;
  auth?: AuthState;
  organizationId?: string | null;
  userId?: string | null;
  refreshMs?: number;
  timeoutMs?: number;
}
const getUserIdFor = (userId: string | null) => async () => userId;
function tree({ service, auth = { status: 'authenticated', aal: 'aal1' }, organizationId = A, userId = 'user-1', refreshMs = 60_000, timeoutMs = 5_000 }: HarnessProps, getUserId = getUserIdFor(userId)) {
  return (
    <AuthContext.Provider value={authValue(auth)}>
      <TenantContext.Provider value={tenantValue(organizationId)}>
        <PermissionsProvider service={service} getUserId={getUserId} refreshMs={refreshMs} timeoutMs={timeoutMs}><Probe /></PermissionsProvider>
      </TenantContext.Provider>
    </AuthContext.Provider>
  );
}

async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); }
const status = () => screen.getByTestId('status').textContent;
const codes = () => screen.getByTestId('codes').textContent;

function setOnline(value: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(value);
  act(() => { window.dispatchEvent(new Event(value ? 'online' : 'offline')); });
}
function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  renders.length = 0;
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('PermissionsProvider: consulta ao autenticar (RF-004, RF-006, RF-007)', () => {
  it.each<[string, AuthState]>([
    ['sem sessão', { status: 'signed_out' }],
    ['verificando a sessão', { status: 'checking' }],
    ['sessão limitada à verificação em duas etapas', { status: 'mfa_required' }],
  ])('não consulta %s e não expõe permissões', async (_nome, auth) => {
    const { service, query } = serviceReturning(success(ADMIN));
    render(tree({ service, auth }));
    await flush();
    expect(query).not.toHaveBeenCalled();
    expect(status()).toBe('loading');
    expect(codes()).toBe('nenhuma');
  });

  it('autenticada consulta com o tenant ativo e expõe as permissões em ready', async () => {
    const { service, query } = serviceReturning(success(ADMIN));
    render(tree({ service }));
    await flush();
    expect(query).toHaveBeenCalledWith(A);
    expect(status()).toBe('ready');
    expect(codes()).toBe('audit.read,tenant.manage|');
  });

  it('sem tenant ativo consulta sem organization_id', async () => {
    const { service, query } = serviceReturning(success({ tenant: [], global: ['platform.manage'] }));
    render(tree({ service, organizationId: null }));
    await flush();
    expect(query).toHaveBeenCalledWith(null);
    expect(codes()).toBe('|platform.manage');
  });

  it('enquanto carrega não expõe permissões', async () => {
    const pending = deferred<PermissionsOutcome>();
    const { service } = serviceReturning(pending.promise);
    render(tree({ service }));
    await flush();
    expect(status()).toBe('loading');
    expect(codes()).toBe('nenhuma');
    await act(async () => { pending.resolve(success(ADMIN)); });
    expect(status()).toBe('ready');
  });

  it('resposta fora do contrato (unavailable) vira error sem permissões', async () => {
    const { service } = serviceReturning(UNAVAILABLE);
    render(tree({ service }));
    await flush();
    expect(status()).toBe('error');
    expect(codes()).toBe('nenhuma');
  });

  it('"retry" volta a loading e refaz a consulta', async () => {
    const { service, query } = serviceReturning(UNAVAILABLE, success(ADMIN));
    render(tree({ service }));
    await flush();
    expect(status()).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'tentar' }));
    expect(status()).toBe('loading');
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
    expect(status()).toBe('ready');
  });
});

describe('PermissionsProvider: troca de organização e de pessoa (RF-015, RF-017)', () => {
  it('ao trocar o tenant ativo volta a loading antes de qualquer render do novo contexto e descarta as permissões anteriores', async () => {
    const pendingB = deferred<PermissionsOutcome>();
    const { service } = serviceReturning(success(ADMIN), pendingB.promise);
    const view = render(tree({ service, organizationId: A }));
    await flush();
    expect(status()).toBe('ready');
    renders.length = 0;

    view.rerender(tree({ service, organizationId: B }));
    await flush();
    expect(renders.every((entry) => entry === 'loading:nenhuma')).toBe(true);
    expect(status()).toBe('loading');
    await act(async () => { pendingB.resolve(success(OPERATOR)); });
    expect(status()).toBe('ready');
    expect(codes()).toBe('|');
  });

  it('descarta a resposta atrasada do tenant anterior (geração antiga)', async () => {
    const pendingA = deferred<PermissionsOutcome>();
    const { service } = serviceReturning(pendingA.promise, success(OPERATOR));
    const view = render(tree({ service, organizationId: A }));
    await flush();
    view.rerender(tree({ service, organizationId: B }));
    await flush();
    expect(codes()).toBe('|');
    await act(async () => { pendingA.resolve(success(ADMIN)); });
    expect(codes()).toBe('|');
    expect(renders.some((entry) => entry === 'ready:audit.read,tenant.manage|' )).toBe(false);
  });

  it('trocar a pessoa descarta as permissões da anterior', async () => {
    const pendingNext = deferred<PermissionsOutcome>();
    const { service } = serviceReturning(success(ADMIN), pendingNext.promise);
    const view = render(tree({ service }, getUserIdFor('user-1')));
    await flush();
    expect(codes()).toBe('audit.read,tenant.manage|');
    renders.length = 0;
    view.rerender(tree({ service }, getUserIdFor('user-2')));
    await flush();
    expect(status()).toBe('loading');
    expect(renders.every((entry) => entry === 'loading:nenhuma')).toBe(true);
  });

  it('perfil global: o conjunto global vem da nova consulta ao trocar o tenant', async () => {
    const { service } = serviceReturning(success({ tenant: ['tenant.manage'], global: ['platform.manage'] }), success({ tenant: [], global: ['platform.manage'] }));
    const view = render(tree({ service, organizationId: A }));
    await flush();
    expect(codes()).toBe('tenant.manage|platform.manage');
    view.rerender(tree({ service, organizationId: B }));
    await flush();
    expect(codes()).toBe('|platform.manage');
  });

  it('sair descarta o estado e o cache', async () => {
    const { service } = serviceReturning(success(ADMIN));
    const view = render(tree({ service }));
    await flush();
    expect(sessionStorage.length).toBe(1);
    view.rerender(tree({ service, auth: { status: 'signed_out', notice: 'signed_out' } }));
    await flush();
    expect(status()).toBe('loading');
    expect(codes()).toBe('nenhuma');
    expect(sessionStorage.length).toBe(0);
  });
});

describe('PermissionsProvider: carregamento lento, falha e offline (RF-018 a RF-020)', () => {
  it('consulta que nunca responde cai para error em 5 segundos e uma resposta tardia da geração atual o substitui', async () => {
    const pending = deferred<PermissionsOutcome>();
    const { service } = serviceReturning(pending.promise);
    render(tree({ service, timeoutMs: 5_000 }));
    await flush();
    expect(status()).toBe('loading');
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(status()).toBe('loading');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(status()).toBe('error');
    expect(codes()).toBe('nenhuma');
    await act(async () => { pending.resolve(success(ADMIN)); });
    expect(status()).toBe('ready');
    expect(codes()).toBe('audit.read,tenant.manage|');
  });

  it('grava os códigos no cache da aba depois de cada sucesso', async () => {
    const { service } = serviceReturning(success(ADMIN));
    render(tree({ service }));
    await flush();
    expect(createPermissionsCache().read('user-1', A)?.codes).toEqual(ADMIN);
  });

  it('offline com cache da mesma pessoa e tenant mostra as últimas permissões', async () => {
    createPermissionsCache().write('user-1', A, ADMIN);
    const { service, query } = serviceReturning(deferred<PermissionsOutcome>().promise);
    render(tree({ service }));
    await flush();
    setOnline(false);
    await flush();
    expect(status()).toBe('offline');
    expect(codes()).toBe('audit.read,tenant.manage|');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('offline sem cache expõe só o estado, sem permissões', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { service, query } = serviceReturning(success(ADMIN));
    render(tree({ service }));
    await flush();
    expect(status()).toBe('offline');
    expect(codes()).toBe('nenhuma');
    expect(query).not.toHaveBeenCalled();
  });

  it('offline não usa o cache de outro tenant nem de outra pessoa', async () => {
    createPermissionsCache().write('user-1', B, ADMIN);
    createPermissionsCache().write('user-2', A, ADMIN);
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { service } = serviceReturning(success(OPERATOR));
    render(tree({ service }));
    await flush();
    expect(codes()).toBe('nenhuma');
  });

  it('online nunca usa o cache para mostrar item antes da confirmação', async () => {
    createPermissionsCache().write('user-1', A, ADMIN);
    const pending = deferred<PermissionsOutcome>();
    const { service } = serviceReturning(pending.promise);
    render(tree({ service }));
    await flush();
    expect(status()).toBe('loading');
    expect(codes()).toBe('nenhuma');
    expect(renders.every((entry) => !entry.includes('tenant.manage'))).toBe(true);
  });

  it('não falha com sessionStorage indisponível', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
    const { service } = serviceReturning(success(ADMIN));
    render(tree({ service }));
    await flush();
    expect(status()).toBe('ready');
  });
});

describe('PermissionsProvider: atualização periódica (RF-016)', () => {
  it('consulta de novo a cada intervalo com a aba visível e online', async () => {
    const { service, query } = serviceReturning(success(ADMIN));
    render(tree({ service, refreshMs: 60_000 }));
    await flush();
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(query).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('não consulta com a aba oculta e refaz ao voltar a ficar visível', async () => {
    const { service, query } = serviceReturning(success(ADMIN));
    render(tree({ service, refreshMs: 60_000 }));
    await flush();
    setVisibility('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(query).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('pausa offline e refaz ao voltar a rede', async () => {
    const { service, query } = serviceReturning(success(ADMIN));
    render(tree({ service, refreshMs: 60_000 }));
    await flush();
    setOnline(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(query).toHaveBeenCalledTimes(1);
    setOnline(true);
    await flush();
    expect(query).toHaveBeenCalledTimes(2);
    expect(status()).toBe('ready');
  });

  it('reflete a permissão ganha e a perdida no mesmo prazo', async () => {
    const { service } = serviceReturning(success({ tenant: [], global: [] }), success(ADMIN), success({ tenant: [], global: [] }));
    render(tree({ service, refreshMs: 60_000 }));
    await flush();
    expect(codes()).toBe('|');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(codes()).toBe('audit.read,tenant.manage|');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(codes()).toBe('|');
  });

  it('limpa o temporizador ao desmontar e ao sair', async () => {
    const { service, query } = serviceReturning(success(ADMIN));
    const view = render(tree({ service, refreshMs: 60_000 }));
    await flush();
    view.rerender(tree({ service, refreshMs: 60_000, auth: { status: 'signed_out' } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(query).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(query).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
