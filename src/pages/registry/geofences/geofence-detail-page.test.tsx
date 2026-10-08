import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { GeofenceView } from '@/application/registry/registry-views';
import { GeofenceDetailView, type GeofenceAbilities } from './geofence-detail-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const GEOFENCE = '84000000-0000-4000-8000-0000000000a1';
const ALL: GeofenceAbilities = { write: true, deactivate: true, history: true };
const READ_ONLY: GeofenceAbilities = { write: false, deactivate: false, history: false };

const geofence = (over: Partial<GeofenceView> = {}): GeofenceView => ({
  id: GEOFENCE, name: 'Portão', shape: 'circle', status: 'active', version: 2, siteId: '82000000-0000-4000-8000-000000000001', siteName: 'Matriz', siteStatus: 'active',
  customerId: '81000000-0000-4000-8000-000000000001', customerName: 'Hospital Teste', areaM2: 125664, center: { lat: -23.55, lng: -46.633 }, radiusM: 200, vertices: [], ...over,
});

const fakeService = (result: unknown, inside: unknown = { kind: 'success', value: true }) =>
  ({ history: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })), getGeofence: vi.fn(async () => result), pointInGeofence: vi.fn(async () => inside) }) as unknown as RegistryService & Record<'getGeofence' | 'pointInGeofence', ReturnType<typeof vi.fn>>;
const renderDetail = (service: ReturnType<typeof fakeService> | null, can = ALL, online = true) =>
  render(<GeofenceDetailView organizationId={ORG} service={service} online={online} geofenceId={GEOFENCE} can={can} />);

describe('detalhe da geocerca (história 3)', () => {
  it('mostra forma, raio, área, unidade e cliente, e a pré-visualização com texto', async () => {
    renderDetail(fakeService({ kind: 'success', value: geofence() }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Portão' })).toBeInTheDocument();
    expect(screen.getByText('200 metros')).toBeInTheDocument();
    expect(screen.getByText(/125\.664 m²/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Matriz' })).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Círculo de 200 metros/);
  });

  it('polígono mostra a quantidade de vértices', async () => {
    renderDetail(fakeService({ kind: 'success', value: geofence({ shape: 'polygon', center: null, radiusM: null, vertices: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] }) }));
    expect(await screen.findByText('Vértices')).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Polígono com 3 vértices/);
  });

  it('"Testar um ponto" pergunta ao servidor e mostra o resultado em texto', async () => {
    const service = fakeService({ kind: 'success', value: geofence() });
    renderDetail(service);
    await screen.findByRole('heading', { level: 2, name: 'Portão' });
    fireEvent.change(screen.getByLabelText('Latitude do ponto'), { target: { value: '-23,55' } });
    fireEvent.change(screen.getByLabelText('Longitude do ponto'), { target: { value: '-46,633' } });
    fireEvent.click(screen.getByRole('button', { name: 'Testar ponto' }));
    expect(await screen.findByText('O ponto está dentro da geocerca.')).toBeInTheDocument();
    expect(service.pointInGeofence).toHaveBeenCalledWith(ORG, GEOFENCE, -23.55, -46.633);
  });

  it('geocerca inativa não oferece o teste nem a edição', async () => {
    renderDetail(fakeService({ kind: 'success', value: geofence({ status: 'inactive' }) }));
    expect(await screen.findByText(/disponível só para geocercas ativas/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar geocerca' })).not.toBeInTheDocument();
  });

  it('"Editar geocerca" só com permissão', async () => {
    const { unmount } = renderDetail(fakeService({ kind: 'success', value: geofence() }));
    expect(await screen.findByRole('link', { name: 'Editar geocerca' })).toHaveAttribute('href', `/geocercas/${GEOFENCE}/editar`);
    unmount();
    renderDetail(fakeService({ kind: 'success', value: geofence() }), READ_ONLY);
    await screen.findByRole('heading', { level: 2, name: 'Portão' });
    expect(screen.queryByRole('link', { name: 'Editar geocerca' })).not.toBeInTheDocument();
  });

  it('estados de não encontrada, erro e sem serviço', async () => {
    const first = renderDetail(fakeService({ kind: 'not_found' }));
    expect(await screen.findByText('Geocerca não encontrada')).toBeInTheDocument();
    first.unmount();
    const second = renderDetail(fakeService({ kind: 'unavailable' }));
    expect(await screen.findByText('Não foi possível carregar a geocerca')).toBeInTheDocument();
    second.unmount();
    renderDetail(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});
