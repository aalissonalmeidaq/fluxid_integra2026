import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NO_ABILITIES } from './trip-abilities';
import { fakeTripService, ORG, TRIP } from './trip-test-support';
import { TripDetailView } from './trip-detail-page';

const renderDetail = (service: ReturnType<typeof fakeTripService>, abilities = NO_ABILITIES) =>
  render(<TripDetailView organizationId={ORG} tripId={TRIP} service={service} online abilities={abilities} />);

describe('detalhe da viagem: histórico (US6)', () => {
  it('quem tem trip.history vê o histórico, pedido ao servidor da mais recente para a mais antiga', async () => {
    const service = fakeTripService({ tripHistory: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })) });
    renderDetail(service, { ...NO_ABILITIES, history: true });
    expect(await screen.findByRole('heading', { level: 3, name: 'Histórico' })).toBeInTheDocument();
    await waitFor(() => expect(service.tripHistory).toHaveBeenCalledWith(ORG, TRIP, expect.objectContaining({ order: 'desc' })));
    expect(await screen.findByText('Nenhum evento encontrado para estes filtros.')).toBeInTheDocument();
  });

  it('sem trip.history o histórico nem é pedido ao servidor', async () => {
    const service = fakeTripService();
    renderDetail(service);
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('heading', { name: 'Histórico' })).not.toBeInTheDocument();
    expect(service.tripHistory).not.toHaveBeenCalled();
  });
});
