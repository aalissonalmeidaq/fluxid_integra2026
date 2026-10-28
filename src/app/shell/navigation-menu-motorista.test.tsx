import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthContext, type AuthContextValue } from '../auth/auth-context';
import { PermissionsContext, type PermissionsContextValue } from '../navigation/permissions-context';
import type { MyDriverTripsLoad } from '@/pages/tracking/use-my-driver-trips';
import { NavigationMenu } from './navigation-menu';

// Spec 015 (T133; RF-007a): a coleta e o envio da viagem em andamento do motorista continuam em qualquer tela, não só na tela da viagem.
// O menu, que já sabe as viagens da pessoa, liga o mantenedor (carregado sob demanda) só quando há viagem em andamento.
const motorista = vi.hoisted(() => ({ load: { kind: 'loading' } as MyDriverTripsLoad }));
vi.mock('@/pages/tracking/use-my-driver-trips', () => ({
  useMyDriverTrips: () => ({ load: motorista.load, organizationId: 'org-1', online: true, retry: vi.fn() }),
}));
vi.mock('@/pages/tracking/driver-tracking-keeper', () => ({
  DriverTrackingKeeper: ({ organizationId, tripIds }: { organizationId: string; tripIds: string[] }) => (
    <p>mantendo {organizationId}: {tripIds.join(',')}</p>
  ),
}));

const auth: AuthContextValue = { state: { status: 'authenticated', aal: 'aal1' }, login: vi.fn(), logout: vi.fn() };
const permissions: PermissionsContextValue = { status: 'ready', permissions: { tenant: ['profile.read'], global: [] }, retry: vi.fn() };
const trip = (id: string, status: string) => ({ id, number: 1, status, plannedDate: '2026-10-28', startedAt: null, vehiclePlate: 'ABC1D23', stopCount: 1 });

const renderMenu = () => render(
  <AuthContext.Provider value={auth}>
    <PermissionsContext.Provider value={permissions}>
      <NavigationMenu open={false} onClose={vi.fn()} />
    </PermissionsContext.Provider>
  </AuthContext.Provider>,
);

describe('NavigationMenu: coleta do motorista fora da tela da viagem', () => {
  it('com viagem em andamento, mantém a coleta e o envio só dela', async () => {
    motorista.load = { kind: 'ready', savedAt: null, view: { isDriver: true, trips: [trip('t-1', 'in_progress'), trip('t-2', 'planned')] } };
    renderMenu();
    await waitFor(() => expect(screen.getByText('mantendo org-1: t-1')).toBeInTheDocument());
  });

  it('sem viagem em andamento, nada é carregado', async () => {
    motorista.load = { kind: 'ready', savedAt: null, view: { isDriver: true, trips: [trip('t-2', 'planned')] } };
    renderMenu();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/mantendo/)).not.toBeInTheDocument();
  });
});
