import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TripOfCylinder, TripOfSite } from '@/application/trips/trip-views';
import { fakeTripService, listItem, ORG } from '../trip-test-support';
import { TripsOfBlock } from './trips-of-block';

const ofCylinder = (n: number, over: Partial<TripOfCylinder> = {}): TripOfCylinder => ({ ...listItem({ id: `t${n}`, number: n }), itemStatus: 'in_transit', lockStatus: 'locked', ...over });
const ofSite = (n: number, over: Partial<TripOfSite> = {}): TripOfSite => ({ ...listItem({ id: `t${n}`, number: n }), stopStatus: 'pending', ...over });

describe('bloco "Viagens"', () => {
  it('cilindro: lista cada viagem com link e a situação do cilindro nela', async () => {
    const tripsOfCylinder = vi.fn(async () => ({ kind: 'success' as const, value: { items: [ofCylinder(9), ofCylinder(8, { itemStatus: 'delivered', status: 'completed' })], next: null } }));
    const service = fakeTripService({ tripsOfCylinder });
    render(<TripsOfBlock organizationId={ORG} service={service} subject={{ kind: 'cylinder', id: 'c1' }} />);
    const list = await screen.findByRole('list', { name: 'Viagens' });
    expect(service.tripsOfCylinder).toHaveBeenCalledWith(ORG, 'c1', { limit: 10 });
    expect(within(list).getByRole('link', { name: 'Viagem n.º 9' })).toHaveAttribute('href', '/viagens/t9');
    expect(within(list).getByText('Em trânsito')).toBeInTheDocument();
    expect(within(list).getByText('Entregue')).toBeInTheDocument();
  });

  it('unidade: mostra a situação da parada', async () => {
    const service = fakeTripService({ tripsOfSite: vi.fn(async () => ({ kind: 'success' as const, value: { items: [ofSite(5, { stopStatus: 'with_divergence' })], next: null } })) });
    render(<TripsOfBlock organizationId={ORG} service={service} subject={{ kind: 'site', id: 's1' }} />);
    expect(await screen.findByText('Com divergência')).toBeInTheDocument();
    expect(service.tripsOfSite).toHaveBeenCalledWith(ORG, 's1', { limit: 10 });
  });

  it('vazio explica de quem é a lista', async () => {
    const { unmount } = render(<TripsOfBlock organizationId={ORG} service={fakeTripService()} subject={{ kind: 'cylinder', id: 'c1' }} />);
    expect(await screen.findByText('Este cilindro ainda não esteve em nenhuma viagem.')).toBeInTheDocument();
    unmount();
    render(<TripsOfBlock organizationId={ORG} service={fakeTripService()} subject={{ kind: 'site', id: 's1' }} />);
    expect(await screen.findByText('Esta unidade ainda não tem viagens.')).toBeInTheDocument();
  });

  it('"Mostrar mais viagens" pede a próxima página', async () => {
    const tripsOfCylinder = vi.fn()
      .mockResolvedValueOnce({ kind: 'success', value: { items: [ofCylinder(9)], next: 'p2' } })
      .mockResolvedValueOnce({ kind: 'success', value: { items: [ofCylinder(8)], next: null } });
    render(<TripsOfBlock organizationId={ORG} service={fakeTripService({ tripsOfCylinder })} subject={{ kind: 'cylinder', id: 'c1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar mais viagens' }));
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2));
    expect(tripsOfCylinder).toHaveBeenLastCalledWith(ORG, 'c1', { limit: 10, cursor: 'p2' });
  });

  it('falha, tentativa de novo e sem permissão', async () => {
    const tripsOfSite = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'success', value: { items: [ofSite(1)], next: null } });
    const { unmount } = render(<TripsOfBlock organizationId={ORG} service={fakeTripService({ tripsOfSite })} subject={{ kind: 'site', id: 's1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByRole('link', { name: 'Viagem n.º 1' })).toBeInTheDocument();
    unmount();
    render(<TripsOfBlock organizationId={ORG} service={fakeTripService({ tripsOfSite: vi.fn(async () => ({ kind: 'access_denied' })) })} subject={{ kind: 'site', id: 's1' }} />);
    expect(await screen.findByText('Você não tem permissão para ver as viagens.')).toBeInTheDocument();
  });
});
