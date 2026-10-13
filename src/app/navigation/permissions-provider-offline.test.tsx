import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '@/app/auth/auth-context';
import { ConnectivityContext, initialResult, type ConnectivityContextValue } from '@/app/connectivity-context';
import { buildOfflineAccess } from '@/domain/identity/offline-access';
import type { AuthState } from '@/domain/identity/session';
import { PermissionsProvider } from './permissions-provider';
import { usePermissions } from './permissions-context';

// Spec 010, T086 (RF-016a, CA-006): com a sessão restaurada offline, as permissões são as do último registro confirmado pelo servidor; o menu e as
// ações de campo valem por elas. Com a sessão comum nada muda, e o registro nunca vale como permissão confirmada pelo servidor.
const record = buildOfflineAccess({
  actorId: 'user-1', organizationId: 'tenant-a', organizationName: 'Tenant A', organizationKind: 'tenant', endpointId: 'local', aal: 'aal1', displayName: 'Admin',
  permissions: ['trip.operate', 'trip.read', 'cylinder.read'], confirmedAt: new Date('2026-10-12T10:00:00Z'),
});

function Probe() {
  const { status, permissions } = usePermissions();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="tenant">{(permissions?.tenant ?? []).join('|')}</span>
      <span data-testid="global">{(permissions?.global ?? []).join('|') || 'nenhuma'}</span>
    </div>
  );
}

const connectivity: ConnectivityContextValue = { result: { ...initialResult, state: 'offline' }, client: null, config: null, reconnect: vi.fn(), reportOperationalError: vi.fn() };
const auth = (state: AuthState): AuthContextValue =>
  ({ state, login: vi.fn(), logout: vi.fn(), confirmMfa: vi.fn(), verifySession: vi.fn(), mfa: null, offlineAccess: state.status === 'authenticated' && state.offline ? record : null });
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
const renderWith = (state: AuthState) => render(
  <ConnectivityContext.Provider value={connectivity}>
    <AuthContext.Provider value={auth(state)}><PermissionsProvider service={null} getUserId={async () => null}><Probe /></PermissionsProvider></AuthContext.Provider>
  </ConnectivityContext.Provider>,
);

describe('PermissionsProvider com a sessão restaurada offline', () => {
  it('as permissões do tenant vêm do registro e o estado é "offline"', async () => {
    renderWith({ status: 'authenticated', aal: 'aal1', offline: true });
    await flush();
    expect(screen.getByTestId('status').textContent).toBe('offline');
    expect(screen.getByTestId('tenant').textContent).toBe('trip.operate|trip.read|cylinder.read');
  });

  it('as permissões globais nunca vêm do registro offline', async () => {
    renderWith({ status: 'authenticated', aal: 'aal1', offline: true });
    await flush();
    expect(screen.getByTestId('global').textContent).toBe('nenhuma');
  });

  it('sem a marca offline, o registro não vale: sem permissão confirmada', async () => {
    renderWith({ status: 'authenticated', aal: 'aal1' });
    await flush();
    expect(screen.getByTestId('tenant').textContent).toBe('');
  });

  it('sem sessão, nada', async () => {
    renderWith({ status: 'signed_out' });
    await flush();
    expect(screen.getByTestId('tenant').textContent).toBe('');
  });
});
