import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeTripService, listItem, ORG } from './trip-test-support';
import { TripListView } from './trip-list-page';

const renderList = (service: ReturnType<typeof fakeTripService> | null, canCreate = true) => render(<TripListView organizationId={ORG} service={service} canCreate={canCreate} />);

describe('lista de viagens', () => {
  it('mostra as viagens abertas, com situação, atraso e total anunciado', async () => {
    const service = fakeTripService();
    renderList(service);
    expect(await screen.findByText('2 viagens encontradas')).toBeInTheDocument();
    expect(service.listTrips).toHaveBeenCalledWith(ORG, expect.objectContaining({ status: 'open', limit: 25, cursor: null }));
    expect(screen.getAllByRole('link', { name: 'n.º 7' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Atrasada').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Carregando').length).toBeGreaterThan(0);
  });

  it('quem pode planejar vê "Planejar viagem"; quem não pode, não', async () => {
    const { unmount } = renderList(fakeTripService());
    expect(await screen.findByRole('link', { name: 'Planejar viagem' })).toHaveAttribute('href', '/viagens/nova');
    unmount();
    renderList(fakeTripService(), false);
    await screen.findByText('2 viagens encontradas');
    expect(screen.queryByRole('link', { name: 'Planejar viagem' })).not.toBeInTheDocument();
  });

  it('busca e filtros recarregam a lista pela primeira página', async () => {
    const service = fakeTripService();
    renderList(service);
    await screen.findByText('2 viagens encontradas');
    fireEvent.change(screen.getByLabelText('Buscar viagem'), { target: { value: 'ABC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(service.listTrips).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ search: 'ABC', cursor: null })));
    fireEvent.change(screen.getByLabelText('Situação da viagem'), { target: { value: 'completed' } });
    await waitFor(() => expect(service.listTrips).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ status: 'completed', search: 'ABC' })));
    fireEvent.change(screen.getByLabelText('Data prevista, a partir de'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(service.listTrips).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ from: '2026-10-01' })));
  });

  it('"Mostrar mais" mantém os filtros', async () => {
    const listTrips = vi.fn()
      .mockResolvedValueOnce({ kind: 'success', value: { items: [listItem()], total: 2, next: 'p2' } })
      .mockResolvedValueOnce({ kind: 'success', value: { items: [listItem({ id: 'b', number: 8 })], total: 2, next: null } });
    renderList(fakeTripService({ listTrips }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar mais viagens' }));
    await waitFor(() => expect(listTrips).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ cursor: 'p2', status: 'open' })));
  });

  it('estado vazio sem filtro convida a planejar; com filtro pede ajuste', async () => {
    const listTrips = vi.fn(async () => ({ kind: 'success', value: { items: [], total: 0, next: null } }));
    renderList(fakeTripService({ listTrips }));
    expect(await screen.findByText('Nenhuma viagem ainda')).toBeInTheDocument();
    expect(screen.getByText('Esta organização ainda não tem viagens abertas.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Situação da viagem'), { target: { value: 'cancelled' } });
    expect(await screen.findByText(/Nenhuma viagem corresponde à busca/)).toBeInTheDocument();
  });

  it('erro permite tentar de novo; sem permissão e sem conexão explicam', async () => {
    const listTrips = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'success', value: { items: [listItem()], total: 1, next: null } });
    renderList(fakeTripService({ listTrips }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('1 viagem encontrada')).toBeInTheDocument();
  });

  it('sem conexão a lista explica que a consulta exige conexão', async () => {
    renderList(fakeTripService({ listTrips: vi.fn(async () => ({ kind: 'offline' })) }));
    expect(await screen.findByText('Sem conexão. A consulta de viagens exige conexão.')).toBeInTheDocument();
  });

  it('sem serviço mostra conexão indisponível', () => {
    renderList(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});
