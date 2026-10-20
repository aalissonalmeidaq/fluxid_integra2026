import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from './auth-context';
import { OfflineAccessRecorder } from './offline-access-recorder';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import { PermissionsContext, type PermissionsContextValue } from '@/app/navigation/permissions-context';
import { TenantContext, type TenantContextValue } from '@/app/tenant/tenant-context';
import type { AuthState } from '@/domain/identity/session';

// Spec 010, T087 (RF-016; research.md §19a): grava o registro do acesso offline só depois de sessão, tenant e permissões confirmados online, e o atualiza
// a cada confirmação; nunca grava com a sessão restaurada offline nem sem confirmação; o registro não tem token.
const NOW = new Date('2026-10-12T12:00:00Z');
const online: AuthState = { status: 'authenticated', aal: 'aal2' };
const store = () => ({ read: vi.fn(async () => null), save: vi.fn(async () => true), clear: vi.fn(async () => undefined) });

const connectivity = (url: string | null = 'http://127.0.0.1:54321'): ConnectivityContextValue => ({
  result: { ...initialResult, state: 'connected', selectedEndpoint: url ? 'local' : null } as never,
  client: null,
  config: url ? ({ endpoints: [{ kind: 'local', url }] } as never) : null,
  reconnect: vi.fn(), reportOperationalError: vi.fn(),
});
const tenant = (over: Partial<TenantContextValue> = {}): TenantContextValue => ({
  status: 'ready', selection: { kind: 'selected', option: { organizationId: 'tenant-a', displayName: 'Tenant A', kind: 'tenant' } }, options: [], activeOrganizationId: 'tenant-a', switching: false,
  select: vi.fn(), beginSwitch: vi.fn(), cancelSwitch: vi.fn(), reload: vi.fn(), ...over,
});
const permissions = (over: Partial<PermissionsContextValue> = {}): PermissionsContextValue =>
  ({ status: 'ready', permissions: { tenant: ['trip.operate', 'trip.read'], global: [] }, retry: vi.fn(), ...over });

function renderRecorder(opts: { state?: AuthState; offlineStore?: ReturnType<typeof store> | null; tenantValue?: TenantContextValue; permissionsValue?: PermissionsContextValue; url?: string | null; actorId?: string | null } = {}) {
  const offlineStore = opts.offlineStore === undefined ? store() : opts.offlineStore;
  const auth: AuthContextValue = { state: opts.state ?? online, login: vi.fn(), logout: vi.fn(), offlineAccessStore: offlineStore, offlineAccess: null };
  const view = render(
    <ConnectivityContext.Provider value={connectivity(opts.url === undefined ? 'http://127.0.0.1:54321' : opts.url)}>
      <AuthContext.Provider value={auth}>
        <TenantContext.Provider value={opts.tenantValue ?? tenant()}>
          <PermissionsContext.Provider value={opts.permissionsValue ?? permissions()}>
            <OfflineAccessRecorder getActorId={async () => (opts.actorId === undefined ? 'user-1' : opts.actorId)} now={() => NOW} />
          </PermissionsContext.Provider>
        </TenantContext.Provider>
      </AuthContext.Provider>
    </ConnectivityContext.Provider>,
  );
  return { view, offlineStore };
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => { vi.useFakeTimers(); Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }); });
afterEach(() => vi.useRealTimers());

describe('OfflineAccessRecorder', () => {
  it('com tudo confirmado online, grava o registro com a conta, a organização, o destino, o nível e as permissões', async () => {
    const { offlineStore } = renderRecorder();
    await flush();
    expect(offlineStore!.save).toHaveBeenCalledWith({
      version: 1, actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A', organizationKind: 'tenant', endpointId: 'http://127.0.0.1:54321',
      aal: 'aal2', displayName: '', permissions: ['trip.operate', 'trip.read'], confirmedAt: NOW.toISOString(),
    });
  });

  it('nunca grava token nem dado de domínio', async () => {
    const { offlineStore } = renderRecorder();
    await flush();
    expect(JSON.stringify(offlineStore!.save.mock.calls)).not.toMatch(/token|jwt|password|email/i);
  });

  it('atualiza a cada minuto enquanto a sessão estiver confirmada e a aba online', async () => {
    const { offlineStore } = renderRecorder();
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(offlineStore!.save.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['sessão restaurada offline', { state: { status: 'authenticated', aal: 'aal1', offline: true } as AuthState }],
    ['sem sessão', { state: { status: 'signed_out' } as AuthState }],
    ['tenant ainda carregando', { tenantValue: tenant({ status: 'loading', activeOrganizationId: null, selection: { kind: 'none' } }) }],
    ['permissões ainda carregando', { permissionsValue: permissions({ status: 'loading', permissions: null }) }],
    ['permissões com erro', { permissionsValue: permissions({ status: 'error', permissions: null }) }],
    ['permissões só do cache offline', { permissionsValue: permissions({ status: 'offline' }) }],
    ['sem destino selecionado', { url: null }],
    ['conta ainda desconhecida', { actorId: null }],
  ])('não grava com %s', async (_label, opts) => {
    const { offlineStore } = renderRecorder(opts);
    await flush();
    expect(offlineStore!.save).not.toHaveBeenCalled();
  });

  it('sem o armazenamento do acesso offline (recurso desligado), não faz nada', async () => {
    expect(() => renderRecorder({ offlineStore: null })).not.toThrow();
  });

  it('com o aparelho sem rede, não regrava (a última confirmação continua valendo)', async () => {
    const { offlineStore } = renderRecorder();
    await flush();
    const before = offlineStore!.save.mock.calls.length;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(offlineStore!.save.mock.calls.length).toBe(before);
  });
});
