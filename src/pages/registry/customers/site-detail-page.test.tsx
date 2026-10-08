import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { SiteDetail } from '@/application/registry/registry-views';
import { SiteDetailView, type SiteAbilities } from './site-detail-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-0000000000a1';
const SITE = '82000000-0000-4000-8000-0000000000a1';
const GEOFENCE = '84000000-0000-4000-8000-0000000000a1';

const ALL: SiteAbilities = { write: true, deactivate: true, history: true, geofenceWrite: true };
const READ_ONLY: SiteAbilities = { write: false, deactivate: false, history: false, geofenceWrite: false };

const detail = (over: Partial<SiteDetail['site']> = {}, geofences: SiteDetail['geofences'] = []): SiteDetail => ({
  site: {
    id: SITE, customerId: CUSTOMER, customerName: 'Hospital Teste', customerStatus: 'active', name: 'Matriz', postalCode: '01001000', street: 'Praça da Sé', number: '10',
    complement: 'Sala 2', district: 'Sé', city: 'São Paulo', state: 'SP', ibgeCode: '3550308', latitude: -23.55052, longitude: -46.633308, receivingContactName: 'Rui',
    receivingContactPhone: '1131234567', receivingDays: [1, 3], receivingFrom: '08:00:00', receivingTo: '17:00:00', accessInstructions: 'Portaria B', status: 'active', version: 2,
    anonymizedAt: null, coordinatesSource: 'geocoded', coordinatesConfirmedAt: '2026-10-07T15:00:00Z', firstDeliveryConfirmed: false, ...over,
  },
  geofences,
});

const fakeService = (result: unknown) => ({ history: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })), getSite: vi.fn(async () => result) }) as unknown as RegistryService;
const renderDetail = (service: RegistryService | null, can: SiteAbilities = ALL) => render(<SiteDetailView organizationId={ORG} service={service} online customerId={CUSTOMER} siteId={SITE} can={can} />);

describe('detalhe da unidade (história 2)', () => {
  it('mostra endereço, recebimento e instruções', async () => {
    renderDetail(fakeService({ kind: 'success', value: detail() }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Matriz' })).toBeInTheDocument();
    expect(screen.getByText(/Praça da Sé, 10 · Sala 2 · Sé · São Paulo\/SP · CEP 01001-000/)).toBeInTheDocument();
    expect(screen.getByText('Segunda, Quarta, das 08:00 às 17:00')).toBeInTheDocument();
    expect(screen.getByText('Portaria B')).toBeInTheDocument();
    expect(screen.getByText(/Buscadas pelo endereço e confirmadas em/)).toBeInTheDocument();
    expect(screen.getByText('Ainda sem confirmação do motorista')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hospital Teste' })).toHaveAttribute('href', `/clientes/${CUSTOMER}`);
  });

  it('campos vazios mostram "Não informado"', async () => {
    renderDetail(fakeService({ kind: 'success', value: detail({ latitude: null, longitude: null, accessInstructions: null, receivingContactName: null }) }));
    await screen.findByRole('heading', { level: 2, name: 'Matriz' });
    expect(screen.getAllByText('Não informado').length).toBeGreaterThanOrEqual(3);
  });

  it('lista as geocercas com a forma e a situação; sem geocercas oferece criar a primeira, só com permissão', async () => {
    const { unmount } = renderDetail(fakeService({ kind: 'success', value: detail({}, [{ id: GEOFENCE, name: 'Portão', shape: 'circle', status: 'active' }]) }));
    expect(await screen.findByRole('link', { name: 'Portão' })).toHaveAttribute('href', `/geocercas/${GEOFENCE}`);
    expect(screen.getByText('Círculo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar geocerca' })).toHaveAttribute('href', `/geocercas/nova?unidade=${SITE}`);
    unmount();
    const empty = renderDetail(fakeService({ kind: 'success', value: detail() }));
    expect(await screen.findByRole('link', { name: 'Criar a primeira geocerca' })).toBeInTheDocument();
    empty.unmount();
    renderDetail(fakeService({ kind: 'success', value: detail() }), READ_ONLY);
    expect(await screen.findByText('Esta unidade ainda não tem geocercas.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Criar a primeira geocerca' })).not.toBeInTheDocument();
  });

  it('"Editar unidade" só com permissão e unidade ativa', async () => {
    const { unmount } = renderDetail(fakeService({ kind: 'success', value: detail() }));
    expect(await screen.findByRole('link', { name: 'Editar unidade' })).toHaveAttribute('href', `/clientes/${CUSTOMER}/unidades/${SITE}/editar`);
    unmount();
    renderDetail(fakeService({ kind: 'success', value: detail({ status: 'inactive' }) }));
    await screen.findByRole('heading', { level: 2, name: 'Matriz' });
    expect(screen.queryByRole('link', { name: 'Editar unidade' })).not.toBeInTheDocument();
  });

  it('estados de erro, não encontrado e sem serviço', async () => {
    const first = renderDetail(fakeService({ kind: 'not_found' }));
    expect(await screen.findByText('Unidade não encontrada')).toBeInTheDocument();
    first.unmount();
    const second = renderDetail(fakeService({ kind: 'unavailable' }));
    expect(await screen.findByText('Não foi possível carregar a unidade')).toBeInTheDocument();
    second.unmount();
    renderDetail(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});
