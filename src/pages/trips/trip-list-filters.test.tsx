import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeTripService, ORG } from './trip-test-support';
import { TripListView } from './trip-list-page';

const renderList = (service: ReturnType<typeof fakeTripService> | null) => render(<TripListView organizationId={ORG} service={service} canCreate />);

describe('lista de viagens: filtros por veículo, motorista, cliente e custódia (US6)', () => {
  it('oferece os filtros com as opções do servidor e os envia combinados', async () => {
    const service = fakeTripService();
    renderList(service);
    await screen.findByText('2 viagens encontradas');
    await waitFor(() => expect(screen.getByLabelText('Veículo')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Veículo'), { target: { value: '95000000-0000-4000-8000-000000000001' } });
    fireEvent.change(screen.getByLabelText('Motorista'), { target: { value: '96000000-0000-4000-8000-000000000001' } });
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'c2' } });
    fireEvent.change(screen.getByLabelText('Custódia dos cilindros'), { target: { value: 'in_transit' } });
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'date_asc' } });
    await waitFor(() => expect(service.listTrips).toHaveBeenLastCalledWith(ORG, expect.objectContaining({
      vehicleId: '95000000-0000-4000-8000-000000000001', driverId: '96000000-0000-4000-8000-000000000001', customerId: 'c2', custody: 'in_transit', sort: 'date_asc', cursor: null,
    })));
  });

  it('cada cliente aparece uma só vez, mesmo com várias unidades', async () => {
    renderList(fakeTripService());
    await screen.findByText('2 viagens encontradas');
    const select = await screen.findByLabelText('Cliente');
    expect([...select.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Todos', 'Alfa Saúde', 'Beta Clínica']);
  });

  it('sem acesso às opções (só leitura), a lista continua com busca, situação, custódia e ordem', async () => {
    renderList(fakeTripService({ tripOptions: vi.fn(async () => ({ kind: 'access_denied' })) }));
    await screen.findByText('2 viagens encontradas');
    expect(screen.queryByLabelText('Veículo')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Custódia dos cilindros')).toBeInTheDocument();
  });

  it('veículo e motorista de cada linha levam ao cadastro', async () => {
    renderList(fakeTripService());
    await screen.findByText('2 viagens encontradas');
    expect(screen.getAllByRole('link', { name: 'ABC-1234' })[0]).toHaveAttribute('href', '/veiculos/95000000-0000-4000-8000-000000000001');
    expect(screen.getAllByRole('link', { name: 'Motorista Alfa' })[0]).toHaveAttribute('href', '/motoristas/96000000-0000-4000-8000-000000000001');
  });

  it('filtro de custódia ativo faz o vazio pedir ajuste, não convidar a planejar', async () => {
    const listTrips = vi.fn(async () => ({ kind: 'success', value: { items: [], total: 0, next: null } }));
    renderList(fakeTripService({ listTrips }));
    await screen.findByText('Nenhuma viagem ainda');
    fireEvent.change(screen.getByLabelText('Custódia dos cilindros'), { target: { value: 'at_customer' } });
    expect(await screen.findByText(/Nenhuma viagem corresponde à busca/)).toBeInTheDocument();
  });
});
