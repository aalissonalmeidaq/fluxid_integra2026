import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { SiteDetail } from '@/application/registry/registry-views';
import type { TripService } from '@/application/trips/trip-service';
import { SiteDetailView, type SiteAbilities } from './site-detail-page';

// Spec 008, US6: o bloco "Viagens" da unidade depende de trip.read (RF-027).
const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-0000000000a1';
const SITE = '82000000-0000-4000-8000-0000000000a1';
const ALL: SiteAbilities = { write: true, deactivate: true, history: false, geofenceWrite: true };

const detail = (): SiteDetail => ({
  site: {
    id: SITE, customerId: CUSTOMER, customerName: 'Hospital Teste', customerStatus: 'active', name: 'Matriz', postalCode: '01001000', street: 'Praça da Sé', number: '10',
    complement: null, district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '3550308', latitude: -23.55052, longitude: -46.633308, receivingContactName: null,
    receivingContactPhone: null, receivingDays: [], receivingFrom: null, receivingTo: null, accessInstructions: null, status: 'active', version: 2,
    anonymizedAt: null, coordinatesSource: 'geocoded', coordinatesConfirmedAt: '2026-10-07T15:00:00Z', firstDeliveryConfirmed: false,
  },
  geofences: [],
});

const registry = () => ({ getSite: vi.fn(async () => ({ kind: 'success', value: detail() })) }) as unknown as RegistryService;
const trips = () => ({ tripsOfSite: vi.fn(async () => ({ kind: 'success', value: { items: [], next: null } })) }) as unknown as TripService & { tripsOfSite: ReturnType<typeof vi.fn> };

describe('detalhe da unidade: viagens (Spec 008)', () => {
  it('o bloco "Viagens" aparece só com trip.read e serviço de viagens', async () => {
    const tripService = trips();
    const { unmount } = render(<SiteDetailView organizationId={ORG} service={registry()} online customerId={CUSTOMER} siteId={SITE} can={{ ...ALL, trips: true }} tripService={tripService} />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Viagens' })).toBeInTheDocument();
    await waitFor(() => expect(tripService.tripsOfSite).toHaveBeenCalledWith(ORG, SITE, { limit: 10 }));
    unmount();
    render(<SiteDetailView organizationId={ORG} service={registry()} online customerId={CUSTOMER} siteId={SITE} can={ALL} tripService={tripService} />);
    await screen.findByRole('heading', { level: 2 });
    expect(screen.queryByRole('heading', { name: 'Viagens' })).not.toBeInTheDocument();
  });
});
