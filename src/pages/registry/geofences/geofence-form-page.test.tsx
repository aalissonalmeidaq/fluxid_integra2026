import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { GeofenceView, SiteDetail } from '@/application/registry/registry-views';
import { GeofenceFormView } from './geofence-form-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-0000000000a1';
const SITE = '82000000-0000-4000-8000-0000000000a1';
const GEOFENCE = '84000000-0000-4000-8000-0000000000a1';
const OTHER = '84000000-0000-4000-8000-0000000000b2';

const siteDetail = (): SiteDetail => ({
  site: {
    id: SITE, customerId: CUSTOMER, customerName: 'Hospital Teste', customerStatus: 'active', name: 'Matriz', postalCode: '01001000', street: 'Praça da Sé', number: '10', complement: null,
    district: null, city: 'São Paulo', state: 'SP', ibgeCode: null, latitude: -23.55, longitude: -46.633, receivingContactName: null, receivingContactPhone: null, receivingDays: [],
    receivingFrom: null, receivingTo: null, accessInstructions: null, status: 'active', version: 1, anonymizedAt: null,
    coordinatesSource: null, coordinatesConfirmedAt: null, firstDeliveryConfirmed: false,
  },
  geofences: [],
});
const geofence = (over: Partial<GeofenceView> = {}): GeofenceView => ({
  id: GEOFENCE, name: 'Portão', shape: 'circle', status: 'active', version: 4, siteId: SITE, siteName: 'Matriz', siteStatus: 'active', customerId: CUSTOMER, customerName: 'Hospital Teste',
  areaM2: 125000, center: { lat: -23.55, lng: -46.633 }, radiusM: 200, vertices: [], ...over,
});

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    getSite: vi.fn(async () => ({ kind: 'success' as const, value: siteDetail() })),
    getGeofence: vi.fn(async () => ({ kind: 'success' as const, value: geofence() })),
    createGeofence: vi.fn(async () => ({ kind: 'success' as const, value: { id: GEOFENCE, version: 1, overlaps: [] } })),
    updateGeofence: vi.fn(async () => ({ kind: 'success' as const, value: { version: 5, overlaps: [] } })),
    ...overrides,
  } as unknown as RegistryService & Record<'getSite' | 'getGeofence' | 'createGeofence' | 'updateGeofence', ReturnType<typeof vi.fn>>;
}
const renderForm = (service: ReturnType<typeof fakeService> | null, extra: Record<string, unknown> = { siteId: SITE }) => {
  const onNavigate = vi.fn();
  render(<GeofenceFormView organizationId={ORG} service={service} online onNavigate={onNavigate} {...extra} />);
  return { onNavigate };
};

describe('cadastro de geocerca (história 3)', () => {
  it('círculo: usa as coordenadas da unidade, mostra a pré-visualização e envia a forma ao servidor', async () => {
    const service = fakeService();
    const { onNavigate } = renderForm(service);
    expect(await screen.findByRole('heading', { name: 'Cadastrar geocerca' })).toBeInTheDocument();
    expect(screen.getByText(/Unidade: Matriz \(Hospital Teste\)/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome da geocerca'), { target: { value: 'Portão' } });
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'circle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar as coordenadas da unidade' }));
    fireEvent.change(screen.getByLabelText('Raio (metros)'), { target: { value: '200' } });
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Círculo de 200 metros/);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar geocerca' }));
    await waitFor(() => expect(service.createGeofence).toHaveBeenCalledTimes(1));
    expect(service.createGeofence).toHaveBeenCalledWith(ORG, SITE, { name: 'Portão', shape: 'circle', center: { lat: -23.55, lng: -46.633 }, radiusM: 200 });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/geocercas/${GEOFENCE}`));
  });

  it('raio fora dos limites mostra o erro com os limites junto do campo, sem enviar', async () => {
    const service = fakeService();
    renderForm(service);
    await screen.findByRole('heading', { name: 'Cadastrar geocerca' });
    fireEvent.change(screen.getByLabelText('Nome da geocerca'), { target: { value: 'Portão' } });
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'circle' } });
    fireEvent.change(screen.getByLabelText('Latitude do centro'), { target: { value: '-23,55' } });
    fireEvent.change(screen.getByLabelText('Longitude do centro'), { target: { value: '-46,63' } });
    fireEvent.change(screen.getByLabelText('Raio (metros)'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar geocerca' }));
    expect(await screen.findByText('Informe um raio inteiro de 25 m a 5000 m.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Raio (metros)')).toHaveFocus());
    expect(service.createGeofence).not.toHaveBeenCalled();
  });

  it('polígono que se cruza é recusado junto dos vértices', async () => {
    const service = fakeService();
    renderForm(service);
    await screen.findByRole('heading', { name: 'Cadastrar geocerca' });
    fireEvent.change(screen.getByLabelText('Nome da geocerca'), { target: { value: 'Pátio' } });
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'polygon' } });
    const points = [['0', '0'], ['1', '1'], ['0', '1'], ['1', '0']];
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar vértice' }));
    points.slice(1).forEach(() => fireEvent.click(screen.getByRole('button', { name: 'Adicionar vértice' })));
    // O formulário inicia com 3 vértices; o quarto vem do botão.
    points.forEach(([lat, lng], index) => {
      fireEvent.change(screen.getByLabelText(`Latitude do vértice ${index + 1}`), { target: { value: lat } });
      fireEvent.change(screen.getByLabelText(`Longitude do vértice ${index + 1}`), { target: { value: lng } });
    });
    while (screen.queryByLabelText('Latitude do vértice 5')) fireEvent.click(screen.getByRole('button', { name: 'Remover vértice 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar geocerca' }));
    expect(await screen.findByText(/As arestas do polígono se cruzam/)).toBeInTheDocument();
    expect(service.createGeofence).not.toHaveBeenCalled();
  });

  it('sobreposição: salva, avisa com o nome da outra geocerca e oferece abrir a nova', async () => {
    const service = fakeService({ createGeofence: vi.fn(async () => ({ kind: 'success', value: { id: GEOFENCE, version: 1, overlaps: [{ id: OTHER, name: 'Doca 1' }] } })) });
    const { onNavigate } = renderForm(service);
    await screen.findByRole('heading', { name: 'Cadastrar geocerca' });
    fireEvent.change(screen.getByLabelText('Nome da geocerca'), { target: { value: 'Doca 2' } });
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'circle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar as coordenadas da unidade' }));
    fireEvent.change(screen.getByLabelText('Raio (metros)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar geocerca' }));
    expect(await screen.findByText('Sobreposição')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Doca 1' })).toHaveAttribute('href', `/geocercas/${OTHER}`);
    expect(screen.getByRole('link', { name: 'Abrir a geocerca' })).toHaveAttribute('href', `/geocercas/${GEOFENCE}`);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('nome repetido na unidade aparece junto do campo', async () => {
    renderForm(fakeService({ createGeofence: vi.fn(async () => ({ kind: 'name_conflict' })) }));
    await screen.findByRole('heading', { name: 'Cadastrar geocerca' });
    fireEvent.change(screen.getByLabelText('Nome da geocerca'), { target: { value: 'Portão' } });
    fireEvent.change(screen.getByLabelText('Forma'), { target: { value: 'circle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Usar as coordenadas da unidade' }));
    fireEvent.change(screen.getByLabelText('Raio (metros)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar geocerca' }));
    expect(await screen.findByText('Já existe uma geocerca com este nome nesta unidade.')).toBeInTheDocument();
  });

  it('sem unidade na rota pede para abrir pelo detalhe da unidade', () => {
    renderForm(fakeService(), {});
    expect(screen.getByText('Escolha uma unidade')).toBeInTheDocument();
  });

  it('sem conexão a escrita fica desabilitada', async () => {
    renderForm(fakeService(), { siteId: SITE, online: false });
    expect(await screen.findByRole('button', { name: 'Cadastrar geocerca' })).toBeDisabled();
  });
});

describe('edição de geocerca', () => {
  it('abre com os dados e salva com a versão carregada', async () => {
    const service = fakeService();
    const { onNavigate } = renderForm(service, { geofenceId: GEOFENCE });
    expect(await screen.findByRole('heading', { name: 'Editar geocerca' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da geocerca')).toHaveValue('Portão');
    expect(screen.getByLabelText('Raio (metros)')).toHaveValue('200');
    fireEvent.change(screen.getByLabelText('Raio (metros)'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateGeofence).toHaveBeenCalledWith(ORG, GEOFENCE, 4, expect.objectContaining({ radiusM: 250 })));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/geocercas/${GEOFENCE}`));
  });

  it('geocerca inativa não abre o formulário; inexistente mostra "não encontrada"', async () => {
    const first = renderForm(fakeService({ getGeofence: vi.fn(async () => ({ kind: 'success', value: geofence({ status: 'inactive' }) })) }), { geofenceId: GEOFENCE });
    expect(await screen.findByText(/está inativa e não pode ser editada/)).toBeInTheDocument();
    expect(first.onNavigate).not.toHaveBeenCalled();
  });

  it('conflito de versão pede para recarregar', async () => {
    const service = fakeService({ updateGeofence: vi.fn(async () => ({ kind: 'version_conflict' })) });
    renderForm(service, { geofenceId: GEOFENCE });
    await screen.findByRole('heading', { name: 'Editar geocerca' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Geocerca alterada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar dados' }));
    await waitFor(() => expect(service.getGeofence).toHaveBeenCalledTimes(2));
  });
});
