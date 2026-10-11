import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TripService } from '@/application/trips/trip-service';
import type { CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderDetail } from '@/application/cylinders/cylinder-views';
import { CylinderDetailView, type DetailAbilities } from './cylinder-detail-page';

// Spec 008, US6: a custódia aparece no detalhe e o bloco "Viagens" depende de trip.read (RF-024, RF-027).
const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = '72000000-0000-4000-8000-000000000001';
const ALL: DetailAbilities = { write: true, deactivate: true, identifier: true, test: true, history: true };

const detail = (cylinder: Partial<CylinderDetail['cylinder']> = {}): CylinderDetail => ({
  cylinder: {
    id: CYL, serialNumber: 'AB-1', type: { id: 't1', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', classification: 'medicinal', active: true },
    manufacturer: null, manufactureYear: null, workingPressureBar: null, notes: null, status: 'active', inactivationReason: null, stockStatus: 'in_stock',
    custodyStatus: 'in_organization', custodySite: null, hydroLastResult: null, hydroNextDueOn: null, version: 3, createdAt: '2026-10-05T13:30:00Z',
    ...cylinder,
  },
  identifiers: [], tests: [], hydroStatus: 'sem_teste',
});

const fakeService = (value: CylinderDetail = detail()) => ({
  get: vi.fn(async () => ({ kind: 'success' as const, value })),
  history: vi.fn(async () => ({ kind: 'success' as const, value: { events: [], next: null } })),
}) as unknown as CylinderService;

describe('detalhe do cilindro: custódia e viagens (Spec 008)', () => {
  it('no cliente mostra a custódia e o link da unidade; na organização, só a custódia', async () => {
    const { unmount } = render(<CylinderDetailView organizationId={ORG} service={fakeService(detail({ custodyStatus: 'at_customer', custodySite: { id: 's1', customerId: 'c1', name: 'Unidade Centro' } }))} online cylinderId={CYL} can={ALL} />);
    expect(await screen.findByText('No cliente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unidade Centro' })).toHaveAttribute('href', '/clientes/c1/unidades/s1');
    unmount();
    render(<CylinderDetailView organizationId={ORG} service={fakeService()} online cylinderId={CYL} can={ALL} />);
    expect(await screen.findByText('Na organização')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Unidade/ })).not.toBeInTheDocument();
  });

  it('o bloco "Viagens" aparece só com trip.read e serviço de viagens', async () => {
    const tripService = { tripsOfCylinder: vi.fn(async () => ({ kind: 'success' as const, value: { items: [], next: null } })) } as unknown as TripService;
    const { unmount } = render(<CylinderDetailView organizationId={ORG} service={fakeService()} online cylinderId={CYL} can={{ ...ALL, trips: true }} tripService={tripService} />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Viagens' })).toBeInTheDocument();
    await waitFor(() => expect(tripService.tripsOfCylinder).toHaveBeenCalledWith(ORG, CYL, { limit: 10 }));
    unmount();
    render(<CylinderDetailView organizationId={ORG} service={fakeService()} online cylinderId={CYL} can={ALL} tripService={tripService} />);
    await screen.findByText('Na organização');
    expect(screen.queryByRole('heading', { name: 'Viagens' })).not.toBeInTheDocument();
  });
});
