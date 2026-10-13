import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TripDetail } from '@/application/trips/trip-views';
import { NO_ABILITIES } from './trip-abilities';
import { TripDetailView } from './trip-detail-page';
import { detail, fakeTripService, ORG, STOP_1, TRIP } from './trip-test-support';

// Spec 010, T023 e T026 (RF-001, RF-003, RF-006, RF-007; US1 cenários 1 a 3; US5 cenário 2): a viagem abre da cópia guardada sem chamar o servidor,
// as quatro operações de campo entram na fila e o resto exige conexão.
const OPERATOR = { ...NO_ABILITIES, operate: true, history: true };
const offlineDetail = (over: Partial<TripDetail> = {}): TripDetail => {
  const base = detail();
  return {
    ...base, offline: true, trip: { ...base.trip, status: 'loading' },
    items: base.items.map((item) => ({ ...item, offline: true, identifiers: [`QR-${item.id.toUpperCase()}`] })),
    ...over,
  };
};
const renderOffline = (service: ReturnType<typeof fakeTripService>, over: Record<string, unknown> = {}) =>
  render(<TripDetailView organizationId={ORG} tripId={TRIP} service={service} online={false} abilities={OPERATOR} {...over} />);

describe('viagem guardada: abrir sem conexão', () => {
  it('mostra a viagem da cópia, o aviso de que o registro fica no aparelho e não mostra o que a cópia não tem', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: offlineDetail() })) });
    renderOffline(service);
    expect(await screen.findByRole('heading', { name: 'Viagem n.º 7' })).toBeInTheDocument();
    expect(screen.getByText('Sem conexão. O que você registrar fica neste aparelho e será enviado quando houver conexão.')).toBeInTheDocument();
    expect(screen.getAllByText('CIL-001').length).toBeGreaterThan(0);
    expect(screen.queryByText('Histórico')).toBeNull();
    expect(screen.queryByText(/Teste hidrostático/)).toBeNull();
    expect(screen.queryByText('Motorista Alfa')).toBeNull();
  });

  it('sem cópia e sem conexão: estado de erro offline com o motivo', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'offline' })) });
    renderOffline(service);
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
    expect(screen.getByText('Esta viagem não está guardada neste aparelho. Abra-a uma vez com conexão para poder usá-la sem conexão.')).toBeInTheDocument();
  });

  it('conferir offline chama o serviço (que enfileira) e mostra "pendente de envio", não "feito"', async () => {
    let checked = false;
    const service = fakeTripService({
      getTrip: vi.fn(async () => ({
        kind: 'success',
        value: offlineDetail({ items: offlineDetail().items.map((item) => (item.id === 'i1' && checked ? { ...item, itemStatus: 'checked' as const, pending: true } : item)) }),
      })),
      checkItem: vi.fn(async () => { checked = true; return { kind: 'success', value: { checked: 1, total: 2 }, pending: { queueItemId: 'q1' } }; }),
    });
    renderOffline(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir CIL-001' }));
    await waitFor(() => expect(service.checkItem).toHaveBeenCalledWith(ORG, TRIP, 'i1', expect.any(String)));
    expect((await screen.findAllByText('Conferido, pendente de envio')).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('Cilindro CIL-001 registrado neste aparelho. Pendente de envio.');
  });

  it('recusa da fila (sessão offline expirada, viagem não guardada) aparece em texto', async () => {
    const service = fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: offlineDetail() })),
      checkItem: vi.fn(async () => ({ kind: 'offline_refused', refusal: 'session_expired', message: 'Sessão offline expirada. Conecte-se para entrar de novo.' })),
    });
    renderOffline(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir CIL-001' }));
    expect((await screen.findAllByText('Sessão offline expirada. Conecte-se para entrar de novo.')).length).toBeGreaterThan(0);
  });

  it('ações que exigem conexão ficam desabilitadas com o motivo', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: offlineDetail() })) });
    renderOffline(service, { abilities: { ...OPERATOR, cancel: true, exception: true } });
    expect(await screen.findByRole('button', { name: 'Cancelar viagem' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Iniciar viagem' })).toBeDisabled();
    expect(screen.getAllByText('Exige conexão').length).toBeGreaterThan(0);
  });

  it('código lido que não é da viagem guardada: "Não foi possível confirmar este código sem conexão." e nada é conferido', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: offlineDetail() })) });
    const fieldService = { resolveIdentifier: vi.fn() } as never;
    renderOffline(service, { fieldService });
    fireEvent.change(await screen.findByLabelText('Código do cilindro'), { target: { value: 'XYZ-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    expect((await screen.findAllByText('Não foi possível confirmar este código sem conexão.')).length).toBeGreaterThan(0);
    expect(service.checkItem).not.toHaveBeenCalled();
    expect((fieldService as { resolveIdentifier: ReturnType<typeof vi.fn> }).resolveIdentifier).not.toHaveBeenCalled();
  });

  it('código lido que é da viagem guardada confere o item sem falar com o servidor', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: offlineDetail() })) });
    const fieldService = { resolveIdentifier: vi.fn() } as never;
    renderOffline(service, { fieldService });
    fireEvent.change(await screen.findByLabelText('Código do cilindro'), { target: { value: ' qr-i2 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
    await waitFor(() => expect(service.checkItem).toHaveBeenCalledWith(ORG, TRIP, 'i2', expect.any(String), 'typed'));
    expect((fieldService as { resolveIdentifier: ReturnType<typeof vi.fn> }).resolveIdentifier).not.toHaveBeenCalled();
  });

  it('chegar offline chama o serviço e a parada aparece pendente', async () => {
    const inProgress = (arrived: boolean): TripDetail => {
      const base = offlineDetail();
      return { ...base, trip: { ...base.trip, status: 'in_progress' }, stops: base.stops.map((stop) => (arrived ? { ...stop, status: 'on_site' as const, arrivedAt: '2026-10-13T15:00:00Z', pending: true } : stop)) };
    };
    let arrived = false;
    const service = fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: inProgress(arrived) })),
      arriveStop: vi.fn(async () => { arrived = true; return { kind: 'success', value: { outOfOrder: false }, pending: { queueItemId: 'q2' } }; }),
    });
    renderOffline(service);
    fireEvent.click(await screen.findByRole('button', { name: /Registrar chegada à parada 1/ }));
    await waitFor(() => expect(service.arriveStop).toHaveBeenCalledWith(ORG, TRIP, STOP_1, expect.any(String)));
    expect((await screen.findAllByText('No local, pendente de envio')).length).toBeGreaterThan(0);
  });
});

describe('guardar a cópia ao abrir com conexão', () => {
  const online = (service: ReturnType<typeof fakeTripService>, abilities = OPERATOR) =>
    render(<TripDetailView organizationId={ORG} tripId={TRIP} service={service} online abilities={abilities} />);
  const inProgress = (): TripDetail => { const base = detail(); return { ...base, trip: { ...base.trip, status: 'in_progress' } }; };

  it('quem opera uma viagem em carregamento ou em andamento grava a cópia', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: inProgress() })), rememberTrip: vi.fn(async () => undefined) });
    online(service);
    await waitFor(() => expect(service.rememberTrip).toHaveBeenCalledWith(ORG, TRIP));
  });

  it('quem não tem trip.operate não grava nada', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: inProgress() })), rememberTrip: vi.fn(async () => undefined) });
    online(service, { ...NO_ABILITIES, history: true });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(service.rememberTrip).not.toHaveBeenCalled();
  });

  it('viagem planejada (que não opera offline) não grava', async () => {
    const service = fakeTripService({ rememberTrip: vi.fn(async () => undefined) });
    online(service);
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(service.rememberTrip).not.toHaveBeenCalled();
  });
});
