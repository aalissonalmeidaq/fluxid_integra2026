import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyDriverTripView } from '@/application/tracking/trip-tracking-service';
import { MyDriverTripsScreen } from './my-driver-trips-page';

// Spec 015 (validação humana): "Minha viagem". A pessoa motorista vê só as próprias viagens planejadas ou em andamento e, na em
// andamento, o painel de coleta; sem conexão vê a última lista guardada como informação anterior. Quem não é motorista recebe uma
// explicação, não uma tela vazia.
const IN_PROGRESS: MyDriverTripView = { id: 't2', number: 2, status: 'in_progress', plannedDate: '2026-10-27', startedAt: '2026-10-27T14:43:00Z',
  vehiclePlate: 'DEM1A14', stopCount: 3 };
const PLANNED: MyDriverTripView = { id: 't3', number: 3, status: 'planned', plannedDate: '2026-10-28', startedAt: null, vehiclePlate: 'DEM1A15', stopCount: 1 };
const panel = (trip: MyDriverTripView) => <p>Painel da viagem {trip.number}</p>;

describe('Minha viagem', () => {
  it('mostra cada viagem com situação, veículo e paradas; o painel de coleta só na viagem em andamento', () => {
    render(<MyDriverTripsScreen load={{ kind: 'ready', view: { isDriver: true, trips: [IN_PROGRESS, PLANNED] }, savedAt: null }} onRetry={vi.fn()} panel={panel} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Minha viagem' })).toBeInTheDocument();
    const current = screen.getByRole('region', { name: 'Viagem 2' });
    expect(within(current).getByText('Em andamento')).toBeInTheDocument();
    expect(within(current).getByText('DEM1A14')).toBeInTheDocument();
    expect(within(current).getByText('3 paradas')).toBeInTheDocument();
    expect(within(current).getByText('Painel da viagem 2')).toBeInTheDocument();
    const next = screen.getByRole('region', { name: 'Viagem 3' });
    expect(within(next).queryByText('Painel da viagem 3')).toBeNull();
    expect(within(next).getByText('A coleta da localização começa quando a viagem for iniciada.')).toBeInTheDocument();
  });

  it('sem conexão, a lista guardada aparece como informação anterior', () => {
    render(<MyDriverTripsScreen load={{ kind: 'ready', view: { isDriver: true, trips: [IN_PROGRESS] }, savedAt: '2026-10-27T15:00:00Z' }} onRetry={vi.fn()} panel={panel} />);
    expect(screen.getByText(/Sem conexão: lista de/)).toBeInTheDocument();
    expect(screen.getByText('Painel da viagem 2')).toBeInTheDocument();
  });

  it('motorista sem viagem e conta que não é de motorista recebem explicações diferentes', () => {
    const { unmount } = render(<MyDriverTripsScreen load={{ kind: 'ready', view: { isDriver: true, trips: [] }, savedAt: null }} onRetry={vi.fn()} panel={panel} />);
    expect(screen.getByText('Nenhuma viagem para você agora')).toBeInTheDocument();
    unmount();
    render(<MyDriverTripsScreen load={{ kind: 'ready', view: { isDriver: false, trips: [] }, savedAt: null }} onRetry={vi.fn()} panel={panel} />);
    expect(screen.getByText('Sua conta não está cadastrada como motorista nesta empresa.')).toBeInTheDocument();
  });

  it('carregando, sem conexão e falha têm estado próprio; a falha permite tentar de novo', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<MyDriverTripsScreen load={{ kind: 'loading' }} onRetry={onRetry} panel={panel} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando suas viagens…');
    rerender(<MyDriverTripsScreen load={{ kind: 'offline' }} onRetry={onRetry} panel={panel} />);
    expect(screen.getByText('Sem conexão: suas viagens aparecem quando a conexão voltar.')).toBeInTheDocument();
    rerender(<MyDriverTripsScreen load={{ kind: 'error' }} onRetry={onRetry} panel={panel} />);
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});
