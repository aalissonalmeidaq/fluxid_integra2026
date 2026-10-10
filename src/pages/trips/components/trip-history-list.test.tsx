import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TripEventView } from '@/application/trips/trip-views';
import { fakeTripService, ORG, TRIP } from '../trip-test-support';
import { TripHistoryList } from './trip-history-list';

const event = (n: number, over: Partial<TripEventView> = {}): TripEventView => ({
  id: `e${n}`, sequence: n, eventType: 'item_checked', actorName: 'Ana Gestora', occurredAt: '2026-10-09T13:00:00Z', justification: null, data: {}, ...over,
});

const page = (events: TripEventView[], next: string | null = null) => ({ kind: 'success' as const, value: { events, next } });
const renderHistory = (service: ReturnType<typeof fakeTripService> | null, extra: Record<string, unknown> = {}) =>
  render(<TripHistoryList organizationId={ORG} tripId={TRIP} service={service} {...extra} />);

describe('histórico da viagem', () => {
  it('mostra carregamento e depois os eventos em frases, com autor e sequência', async () => {
    const tripHistory = vi.fn(async () => page([
      event(3, { eventType: 'delivery_registered', data: { position: 1, delivered: 2, not_delivered: 0, has_recipient: true, outside_geofence: false } }),
      event(2, { eventType: 'trip_cancelled', justification: 'Cliente desistiu', data: { from: 'planned', released: 2, in_transit: 0 } }),
    ]));
    renderHistory(fakeTripService({ tripHistory }));
    expect(screen.getByText('Carregando o histórico…')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Eventos do histórico da viagem' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Entrega registrada');
    expect(items[0]).toHaveTextContent('Parada 1: 2 entregues e 0 não entregues, com recebedor registrado.');
    expect(items[0]).toHaveTextContent('Evento nº 3 · Ana Gestora');
    expect(items[1]).toHaveTextContent('Justificativa: Cliente desistiu');
  });

  it('não mostra nome de recebedor, mesmo que o dado venha com ele', async () => {
    const tripHistory = vi.fn(async () => page([event(1, { eventType: 'delivery_registered', data: { position: 1, delivered: 1, not_delivered: 0, has_recipient: true, recipient_name: 'Nome Sigiloso' } })]));
    renderHistory(fakeTripService({ tripHistory }));
    await screen.findByRole('list', { name: 'Eventos do histórico da viagem' });
    expect(screen.queryByText(/Nome Sigiloso/)).not.toBeInTheDocument();
  });

  it('o filtro por tipo, o período e a ordem vão ao servidor e voltam à primeira página', async () => {
    const service = fakeTripService({ tripHistory: vi.fn(async () => page([event(1)])) });
    renderHistory(service);
    await screen.findByRole('list', { name: 'Eventos do histórico da viagem' });
    expect(service.tripHistory).toHaveBeenLastCalledWith(ORG, TRIP, { order: 'desc', limit: 25 });
    fireEvent.change(screen.getByLabelText('Tipo de evento'), { target: { value: 'item_checked' } });
    await waitFor(() => expect(service.tripHistory).toHaveBeenLastCalledWith(ORG, TRIP, { order: 'desc', limit: 25, eventType: 'item_checked' }));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByLabelText('Ordem'), { target: { value: 'asc' } });
    await waitFor(() => expect(service.tripHistory).toHaveBeenLastCalledWith(ORG, TRIP, { order: 'asc', limit: 25, eventType: 'item_checked', from: '2026-10-01', to: '2026-10-31' }));
  });

  it('"Mostrar mais eventos" acrescenta a próxima página mantendo os filtros', async () => {
    const tripHistory = vi.fn()
      .mockResolvedValueOnce(page([event(2)], 'p2'))
      .mockResolvedValueOnce(page([event(1)], null));
    renderHistory(fakeTripService({ tripHistory }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar mais eventos' }));
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2));
    expect(tripHistory).toHaveBeenLastCalledWith(ORG, TRIP, { order: 'desc', limit: 25, cursor: 'p2' });
    expect(screen.queryByRole('button', { name: 'Mostrar mais eventos' })).not.toBeInTheDocument();
  });

  it('falha ao carregar mais mantém o que já estava na tela e avisa', async () => {
    const tripHistory = vi.fn().mockResolvedValueOnce(page([event(2)], 'p2')).mockResolvedValueOnce({ kind: 'unavailable' });
    renderHistory(fakeTripService({ tripHistory }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar mais eventos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar mais eventos agora.');
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
  });

  it('estado vazio explica; erro permite tentar de novo', async () => {
    const tripHistory = vi.fn().mockResolvedValueOnce(page([])).mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce(page([event(1)]));
    renderHistory(fakeTripService({ tripHistory }));
    expect(await screen.findByText('Nenhum evento encontrado para estes filtros.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ordem'), { target: { value: 'asc' } });
    fireEvent.click(await screen.findByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByRole('list', { name: 'Eventos do histórico da viagem' })).toBeInTheDocument();
  });

  it.each([['access_denied', 'Você não tem permissão para ver o histórico desta viagem.'], ['offline', 'Sem conexão. A consulta do histórico exige conexão.']])('falha %s', async (kind, text) => {
    renderHistory(fakeTripService({ tripHistory: vi.fn(async () => ({ kind })) }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('muda a chave de atualização: recarrega sem a pessoa pedir', async () => {
    const service = fakeTripService({ tripHistory: vi.fn(async () => page([event(1)])) });
    const { rerender } = renderHistory(service, { refreshKey: 2 });
    await screen.findByRole('list');
    rerender(<TripHistoryList organizationId={ORG} tripId={TRIP} service={service} refreshKey={3} />);
    await waitFor(() => expect(service.tripHistory).toHaveBeenCalledTimes(2));
  });

  it('sem serviço mostra a conexão indisponível', () => {
    renderHistory(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});
