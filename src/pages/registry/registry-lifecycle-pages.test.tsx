import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { CustomerDetail, DriverDetail, GeofenceView, SiteDetail } from '@/application/registry/registry-views';
import { CustomerDetailView } from './customers/customer-detail-page';
import { SiteDetailView } from './customers/site-detail-page';
import { DriverDetailView } from './drivers/driver-detail-page';
import { GeofenceDetailView } from './geofences/geofence-detail-page';

// Spec 007, história 6: as ações de inativar e reativar nas páginas de detalhe (RF-033 a RF-035).
const ORG = '20000000-0000-4000-8000-00000000000a';
const ID = '81000000-0000-4000-8000-0000000000a1';
const SITE = '82000000-0000-4000-8000-0000000000a1';
const GEO = '84000000-0000-4000-8000-0000000000a1';
const DRV = '86000000-0000-4000-8000-0000000000a1';

const customer = (status: 'active' | 'inactive', anonymizedAt: string | null = null): CustomerDetail => ({
  customer: { id: ID, personType: 'legal', documentDisplay: '11222333000181', legalName: 'Hospital Teste', tradeName: null, segment: 'hospital', status, anonymizedAt, segmentDetail: null, notes: null, version: 3, createdAt: null },
  contacts: [], sites: [],
});
const site = (status: 'active' | 'inactive'): SiteDetail => ({
  site: {
    id: SITE, customerId: ID, customerName: 'Hospital Teste', customerStatus: 'active', name: 'Matriz', postalCode: '01001000', street: 'Praça da Sé', number: '1', complement: null, district: null, city: 'São Paulo',
    state: 'SP', ibgeCode: null, latitude: null, longitude: null, receivingContactName: null, receivingContactPhone: null, receivingDays: [], receivingFrom: null, receivingTo: null, accessInstructions: null,
    status, version: 2, anonymizedAt: null, coordinatesSource: null, coordinatesConfirmedAt: null, firstDeliveryConfirmed: false,
  },
  geofences: [],
});
const geofence = (status: 'active' | 'inactive'): GeofenceView => ({
  id: GEO, name: 'Portão', shape: 'circle', status, version: 2, siteId: SITE, siteName: 'Matriz', siteStatus: 'active', customerId: ID, customerName: 'Hospital Teste', areaM2: 1000,
  center: { lat: 0, lng: 0 }, radiusM: 100, vertices: [],
});
const driver = (status: 'active' | 'inactive'): DriverDetail => ({
  driver: { id: DRV, fullName: 'Carlos', cpfDisplay: '***.***.***-25', cnhDisplay: '********900', cnhCategory: 'B', cnhValidUntil: '2030-01-31', cnhStatus: 'em_dia', status, version: 2, linked: false, anonymizedAt: null, phone: null },
  linkedUser: null,
});

const ok = { kind: 'success', value: { version: 9 } };
function fakeService(extra: Record<string, unknown>) {
  return {
    history: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })), 
    previewCustomerInactivation: vi.fn(async () => ({ kind: 'success', value: { sites: 1, geofences: 2 } })),
    previewSiteInactivation: vi.fn(async () => ({ kind: 'success', value: { sites: 0, geofences: 4 } })),
    inactivateCustomer: vi.fn(async () => ok), reactivateCustomer: vi.fn(async () => ok), inactivateSite: vi.fn(async () => ok), reactivateSite: vi.fn(async () => ok),
    inactivateGeofence: vi.fn(async () => ok), reactivateGeofence: vi.fn(async () => ok), inactivateDriver: vi.fn(async () => ok), reactivateDriver: vi.fn(async () => ok),
    listLinkableUsers: vi.fn(async () => ({ kind: 'success', value: [] })),
    ...extra,
  } as unknown as RegistryService & Record<string, ReturnType<typeof vi.fn>>;
}
const confirm = async (title: string, action: string, justification = 'Motivo da mudança'): Promise<void> => {
  const dialog = await screen.findByRole('dialog', { name: title });
  fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: justification } });
  fireEvent.click(within(dialog).getByRole('button', { name: action }));
};

describe('ações de inativar e reativar nos detalhes (história 6)', () => {
  it('cliente: inativa com prévia e justificativa, atualiza a situação e anuncia', async () => {
    const service = fakeService({ getCustomer: vi.fn().mockResolvedValueOnce({ kind: 'success', value: customer('active') }).mockResolvedValue({ kind: 'success', value: customer('inactive') }) });
    render(<CustomerDetailView organizationId={ORG} service={service} online customerId={ID} can={{ write: true, deactivate: true, document: false, history: false, anonymize: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar cliente' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('1 unidade ativa e 2 geocercas ativas');
    await confirm('Inativar cliente', 'Confirmar inativação');
    await waitFor(() => expect(service.inactivateCustomer).toHaveBeenCalledWith(ORG, ID, 'Motivo da mudança', { sites: 1, geofences: 2 }));
    expect(await screen.findByText('Cliente inativado.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reativar cliente' })).toBeInTheDocument();
  });

  it('cliente inativo reativa só o cliente e avisa que as unidades continuam inativas', async () => {
    const service = fakeService({ getCustomer: vi.fn(async () => ({ kind: 'success', value: customer('inactive') })) });
    render(<CustomerDetailView organizationId={ORG} service={service} online customerId={ID} can={{ write: true, deactivate: true, document: false, history: false, anonymize: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar cliente' }));
    await confirm('Reativar cliente', 'Confirmar reativação');
    await waitFor(() => expect(service.reactivateCustomer).toHaveBeenCalledWith(ORG, ID, 'Motivo da mudança'));
    expect(await screen.findByText(/continuam inativas: reative cada uma à mão/)).toBeInTheDocument();
  });

  it('sem a permissão de inativar ou com o cliente anonimizado não há ação', async () => {
    const first = render(<CustomerDetailView organizationId={ORG} service={fakeService({ getCustomer: vi.fn(async () => ({ kind: 'success', value: customer('active') })) })} online customerId={ID}
      can={{ write: true, deactivate: false, document: false, history: false, anonymize: false }} />);
    await screen.findByRole('heading', { level: 2, name: 'Hospital Teste' });
    expect(screen.queryByRole('button', { name: 'Inativar cliente' })).not.toBeInTheDocument();
    first.unmount();
    render(<CustomerDetailView organizationId={ORG} service={fakeService({ getCustomer: vi.fn(async () => ({ kind: 'success', value: customer('inactive', '2026-10-07T10:00:00Z') })) })} online customerId={ID}
      can={{ write: true, deactivate: true, document: false, history: false, anonymize: false }} />);
    await screen.findByRole('heading', { level: 2, name: 'Hospital Teste' });
    expect(screen.queryByRole('button', { name: 'Reativar cliente' })).not.toBeInTheDocument();
  });

  it('unidade: inativa mostrando só as geocercas e reativa a inativa', async () => {
    const service = fakeService({ getSite: vi.fn(async () => ({ kind: 'success', value: site('active') })) });
    const view = render(<SiteDetailView organizationId={ORG} service={service} online customerId={ID} siteId={SITE} can={{ write: true, deactivate: true, history: false, geofenceWrite: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar unidade' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('4 geocercas ativas');
    await confirm('Inativar unidade', 'Confirmar inativação');
    await waitFor(() => expect(service.inactivateSite).toHaveBeenCalledWith(ORG, SITE, 'Motivo da mudança', { sites: 0, geofences: 4 }));
    view.unmount();
    const inactive = fakeService({ getSite: vi.fn(async () => ({ kind: 'success', value: site('inactive') })) });
    render(<SiteDetailView organizationId={ORG} service={inactive} online customerId={ID} siteId={SITE} can={{ write: true, deactivate: true, history: false, geofenceWrite: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar unidade' }));
    await confirm('Reativar unidade', 'Confirmar reativação');
    await waitFor(() => expect(inactive.reactivateSite).toHaveBeenCalledWith(ORG, SITE, 'Motivo da mudança'));
  });

  it('geocerca: reativar sob unidade inativa mostra o porquê', async () => {
    const service = fakeService({ getGeofence: vi.fn(async () => ({ kind: 'success', value: geofence('inactive') })), reactivateGeofence: vi.fn(async () => ({ kind: 'parent_inactive' })) });
    render(<GeofenceDetailView organizationId={ORG} service={service} online geofenceId={GEO} can={{ write: true, deactivate: true, history: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar geocerca' }));
    await confirm('Reativar geocerca', 'Confirmar reativação');
    expect(await screen.findByText(/Reative primeiro o cadastro de origem/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('geocerca ativa inativa sem cascata e some o teste de ponto depois', async () => {
    const service = fakeService({ getGeofence: vi.fn().mockResolvedValueOnce({ kind: 'success', value: geofence('active') }).mockResolvedValue({ kind: 'success', value: geofence('inactive') }) });
    render(<GeofenceDetailView organizationId={ORG} service={service} online geofenceId={GEO} can={{ write: true, deactivate: true, history: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar geocerca' }));
    await confirm('Inativar geocerca', 'Confirmar inativação');
    await waitFor(() => expect(service.inactivateGeofence).toHaveBeenCalledWith(ORG, GEO, 'Motivo da mudança'));
    expect(await screen.findByText('Geocerca inativada.')).toBeInTheDocument();
    expect(await screen.findByText(/disponível só para geocercas ativas/)).toBeInTheDocument();
  });

  it('motorista: inativar e reativar com justificativa; o vínculo continua', async () => {
    const service = fakeService({ getDriver: vi.fn().mockResolvedValueOnce({ kind: 'success', value: driver('active') }).mockResolvedValue({ kind: 'success', value: driver('inactive') }) });
    render(<DriverDetailView organizationId={ORG} service={service} online driverId={DRV} can={{ write: true, deactivate: true, document: false, history: false, anonymize: false }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar motorista' }));
    await confirm('Inativar motorista', 'Confirmar inativação');
    await waitFor(() => expect(service.inactivateDriver).toHaveBeenCalledWith(ORG, DRV, 'Motivo da mudança'));
    expect(await screen.findByText(/O vínculo com o usuário continua/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar motorista' }));
    await confirm('Reativar motorista', 'Confirmar reativação');
    await waitFor(() => expect(service.reactivateDriver).toHaveBeenCalledWith(ORG, DRV, 'Motivo da mudança'));
  });
});
