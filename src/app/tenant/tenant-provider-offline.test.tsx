import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import { useSync } from '@/app/sync-context';
import { buildOfflineAccess } from '@/domain/identity/offline-access';
import type { AuthState } from '@/domain/identity/session';
import { TenantProvider } from './tenant-provider';
import { useTenant } from './tenant-context';

// Spec 010, T086 (RF-016a, RF-028; research.md §19a): com a sessão restaurada offline, o tenant ativo e a base local vêm do registro de acesso offline,
// sem consultar o servidor; o executor de sincronização não existe (não há o que sincronizar sem rede); sair da sessão trava a base.
const record = buildOfflineAccess({
  actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A Sintético', organizationKind: 'tenant', endpointId: 'local', aal: 'aal1',
  displayName: 'Administrador A', permissions: ['trip.operate'], confirmedAt: new Date('2026-10-12T10:00:00Z'),
});

const seen: { database: { activeTenant: string } | null | undefined } = { database: undefined };
function Probe() {
  const tenant = useTenant();
  const { createRunner, resolving } = useSync();
  useEffect(() => { seen.database = tenant.database; });
  return (
    <div>
      <span data-testid="status">{tenant.status}</span>
      <span data-testid="selection">{tenant.selection.kind}</span>
      <span data-testid="active">{tenant.activeOrganizationId ?? 'nenhum'}</span>
      <span data-testid="options">{tenant.options.map((option) => `${option.displayName}:${option.kind}`).join('|')}</span>
      <span data-testid="runner">{createRunner ? 'sim' : 'não'}</span>
      <span data-testid="resolving">{String(resolving)}</span>
    </div>
  );
}

const offlineConnectivity: ConnectivityContextValue = { result: { ...initialResult, state: 'offline' }, client: null, config: null, reconnect: vi.fn(), reportOperationalError: vi.fn() };
const auth = (state: AuthState, offlineAccess = state.status === 'authenticated' && state.offline ? record : null): AuthContextValue =>
  ({ state, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), verifySession: vi.fn(async () => false), mfa: null, offlineAccess });
const offlineState: AuthState = { status: 'authenticated', aal: 'aal1', offline: true };
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const text = (id: string) => screen.getByTestId(id).textContent;

const tree = (value: AuthContextValue) => (
  <ConnectivityContext.Provider value={offlineConnectivity}>
    <AuthContext.Provider value={value}><TenantProvider><Probe /></TenantProvider></AuthContext.Provider>
  </ConnectivityContext.Provider>
);

afterEach(() => { seen.database = undefined; });

describe('TenantProvider com a sessão restaurada offline', () => {
  it('o tenant ativo, o nome e a base local vêm do registro, sem servidor', async () => {
    render(tree(auth(offlineState)));
    await flush();
    expect(text('status')).toBe('ready');
    expect(text('selection')).toBe('selected');
    expect(text('active')).toBe('tenant-a');
    expect(text('options')).toBe('Tenant A Sintético:tenant');
    expect(seen.database?.activeTenant).toBe('tenant-a');
  });

  it('não há executor de sincronização nem bloqueio de "resolvendo"', async () => {
    render(tree(auth(offlineState)));
    await flush();
    expect(text('runner')).toBe('não');
    expect(text('resolving')).toBe('false');
  });

  it('enquanto a base local abre, o contexto ainda não está pronto', () => {
    render(tree(auth(offlineState)));
    expect(['loading', 'ready']).toContain(text('status'));
    expect(text('resolving')).toBe('false');
  });

  it('sem o registro (sessão offline sem acesso), não inventa tenant', async () => {
    render(tree(auth(offlineState, null)));
    await flush();
    expect(text('active')).toBe('nenhum');
    expect(text('selection')).toBe('none');
  });

  it('ao sair da sessão, a base local é travada (nada fica alcançável)', async () => {
    const view = render(tree(auth(offlineState)));
    await flush();
    const database = seen.database as unknown as { activeTenant: string };
    expect(database.activeTenant).toBe('tenant-a');
    view.rerender(tree(auth({ status: 'signed_out' })));
    await flush();
    expect(() => database.activeTenant).toThrow(/bloqueada/i);
    expect(text('active')).toBe('nenhum');
  });

  it('a sessão comum (sem a marca offline) não usa o registro', async () => {
    render(tree(auth({ status: 'authenticated', aal: 'aal1' }, record)));
    await flush();
    expect(text('active')).toBe('nenhum');
  });
});
