import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldService, ResolveOutcome } from '@/application/field/field-service';
import type { TripDetail } from '@/application/trips/trip-views';
import { NO_ABILITIES } from './trip-abilities';
import { TripDetailView } from './trip-detail-page';
import { cylinder, detail, fakeTripService, ORG, TRIP } from './trip-test-support';

// Spec 009, US1 (RF-001, RF-003, RF-005, RN-001): na conferência, o código lido ou digitado identifica o cilindro e o item previsto é
// conferido pelo servidor com o método da leitura; o resto só ganha texto.
const OPERATOR = { ...NO_ABILITIES, operate: true };
const loading = (items?: TripDetail['items']): TripDetail => {
  const base = detail();
  return detail({ trip: { ...base.trip, status: 'loading' }, ...(items ? { items } : {}) });
};
const found = (n: number, trip: { id: string; number: number } | null = null): ResolveOutcome => ({
  kind: 'found',
  value: {
    cylinder: { id: cylinder(n).id, serialNumber: `CIL-00${n}`, status: 'active', stockStatus: 'in_stock', hydroStatus: 'em_dia' },
    identifier: { id: 'id1', kind: 'qr_code' }, matchedIndex: 0, trip: trip ? { ...trip, status: 'planned' } : null,
  },
});
const field = (outcome: ResolveOutcome) => ({ resolveIdentifier: vi.fn(async () => outcome) }) as unknown as FieldService & { resolveIdentifier: ReturnType<typeof vi.fn> };

const renderReading = (service: ReturnType<typeof fakeTripService>, fieldService: FieldService | null, extra: Record<string, unknown> = {}) =>
  render(<TripDetailView organizationId={ORG} tripId={TRIP} service={service} fieldService={fieldService} online abilities={OPERATOR} {...extra} />);
// A mensagem aparece à vista (abaixo do campo) e uma vez na região de status da tela, que é quem a anuncia.
const seen = async (message: string): Promise<void> => {
  expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
  expect(screen.getByRole('status')).toHaveTextContent(message);
};
const type = async (value: string): Promise<void> => {
  fireEvent.change(await screen.findByLabelText('Código do cilindro'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Conferir código' }));
};

describe('conferência por código digitado ou de leitor', () => {
  it('identifica o cilindro, confere o item previsto com o método "typed" e diz o resultado em texto', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) });
    const fieldService = field(found(1));
    renderReading(service, fieldService);
    await type('QR-1');
    await waitFor(() => expect(service.checkItem).toHaveBeenCalledWith(ORG, TRIP, 'i1', expect.any(String), 'typed'));
    expect(fieldService.resolveIdentifier).toHaveBeenCalledWith(ORG, [{ value: 'QR-1', origin: 'scanned' }], undefined);
    await seen('Cilindro CIL-001 conferido.');
  });

  it('cilindro já conferido: avisa e não chama a conferência de novo', async () => {
    const items = loading().items.map((item) => (item.id === 'i2' ? { ...item, itemStatus: 'checked' as const } : item));
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading(items) })) });
    renderReading(service, field(found(2)));
    await type('QR-2');
    await seen('Cilindro CIL-002 já estava conferido.');
    expect(service.checkItem).not.toHaveBeenCalled();
  });

  it('cilindro de outra viagem: recusa, não confere e cita a viagem quando o servidor a mostra', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) });
    renderReading(service, field(found(3, { id: 'outra', number: 9 })));
    await type('QR-3');
    await seen('Cilindro CIL-003 não pertence a esta viagem. Está reservado na viagem n.º 9.');
    expect(service.checkItem).not.toHaveBeenCalled();
  });

  it('cilindro de outra viagem sem a viagem à vista (sem trip.read): só diz que não pertence', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) });
    renderReading(service, field(found(3)));
    await type('QR-3');
    await seen('Cilindro CIL-003 não pertence a esta viagem.');
  });

  it('código que não existe (ou de outra organização): "Cilindro não encontrado."', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) });
    renderReading(service, field({ kind: 'not_found' }));
    await type('NAO-EXISTE');
    await seen('Cilindro não encontrado.');
    expect(service.checkItem).not.toHaveBeenCalled();
  });

  it('sessão expirada: avisa a tela de entrada e não confere nada', async () => {
    const onSessionExpired = vi.fn();
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) });
    renderReading(service, field({ kind: 'session_expired' }), { onSessionExpired });
    await type('QR-1');
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
    expect(service.checkItem).not.toHaveBeenCalled();
  });

  it('o servidor recusa a conferência: mostra o motivo e não derruba a tela', async () => {
    const service = fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })),
      checkItem: vi.fn(async () => ({ kind: 'invalid_transition' })),
    });
    renderReading(service, field(found(1)));
    await type('QR-1');
    await waitFor(() => expect(service.checkItem).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Viagem n.º 7' })).toBeInTheDocument();
    expect(screen.getByLabelText('Código do cilindro')).toBeInTheDocument();
  });
});

describe('entrega por leitura', () => {
  const sailing = (): TripDetail => {
    const base = detail();
    return detail({
      trip: { ...base.trip, status: 'in_progress' },
      stops: [{ ...base.stops[0]!, status: 'on_site', arrivedAt: '2026-10-13T15:00:00Z' }],
      items: base.items.map((item) => ({ ...item, itemStatus: 'in_transit' as const, lockStatus: 'locked' as const })),
    });
  };

  it('o código lido marca o cilindro da parada e o método segue no envio da entrega', async () => {
    const service = fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: sailing() })),
      registerDelivery: vi.fn(async () => ({ kind: 'success', value: { deliveryId: 'd1', stopStatus: 'delivered', outsideGeofence: null } })),
    });
    const fieldService = field(found(1));
    renderReading(service, fieldService);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrega da parada 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    fireEvent.change(await within(dialog).findByLabelText('Código do cilindro'), { target: { value: 'QR-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar como entregue' }));
    expect((await within(dialog).findAllByText('Cilindro CIL-001 marcado como entregue.')).length).toBeGreaterThan(0);
    fireEvent.change(within(dialog).getByLabelText('Nome de quem recebeu'), { target: { value: 'Recebedor Fictício' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrega' }));
    await waitFor(() => expect(service.registerDelivery).toHaveBeenCalledTimes(1));
    const value = (service.registerDelivery.mock.calls[0] as unknown as [string, string, string, { results: unknown[] }])[3];
    expect(value.results).toEqual([{ itemId: 'i1', delivered: true, source: 'typed' }, { itemId: 'i2', delivered: true }]);
    expect(fieldService.resolveIdentifier).toHaveBeenCalledTimes(1);
  });

  it('sem o serviço de campo, o diálogo de entrega fica só com o resultado marcado à mão', async () => {
    renderReading(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: sailing() })) }), null);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrega da parada 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    expect(within(dialog).queryByLabelText('Código do cilindro')).toBeNull();
  });
});

describe('chegada com a posição', () => {
  const inProgress = (): TripDetail => {
    const base = detail();
    return detail({ trip: { ...base.trip, status: 'in_progress' }, items: base.items.map((item) => ({ ...item, itemStatus: 'in_transit' as const, lockStatus: 'locked' as const })) });
  };
  const withPosition = (outside?: boolean) => fakeTripService({
    getTrip: vi.fn(async () => ({ kind: 'success', value: inProgress() })),
    arriveStop: vi.fn(async () => ({ kind: 'success', value: { outOfOrder: false, ...(outside === undefined ? {} : { outsideGeofence: outside }) } })),
  });

  it('com coordenadas digitadas, registra a chegada com a posição "informada" e anuncia o resultado', async () => {
    const service = withPosition();
    renderReading(service, null);
    fireEvent.click(await screen.findByRole('button', { name: 'Chegada com a posição da parada 1 (Unidade Central)' }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23,5505' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-46,6333' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar chegada com a posição' }));
    await waitFor(() => expect(service.arriveStop).toHaveBeenCalledWith(ORG, TRIP, expect.any(String), expect.any(String), { latitude: -23.5505, longitude: -46.6333, accuracyM: null, source: 'typed', readAt: null }));
    expect(screen.getByRole('status')).toHaveTextContent('Chegada registrada na parada 1.');
  });

  it('chegada fora da geocerca é aceita e destacada em texto', async () => {
    const service = withPosition(true);
    renderReading(service, null);
    fireEvent.click(await screen.findByRole('button', { name: 'Chegada com a posição da parada 1 (Unidade Central)' }));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-23.5' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '-46.6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar chegada com a posição' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Atenção: a posição está fora da geocerca da unidade.'));
  });

  it('a chegada sem posição continua de um toque e sem nenhum dado de posição', async () => {
    const service = withPosition();
    renderReading(service, null);
    fireEvent.click(await screen.findByRole('button', { name: /Registrar chegada à parada 1/ }));
    await waitFor(() => expect(service.arriveStop).toHaveBeenCalledTimes(1));
    expect((service.arriveStop.mock.calls[0] as unknown[]).length).toBe(4);
  });

  it('sem trip.operate, não oferece chegada nenhuma', async () => {
    renderReading(withPosition(), null, { abilities: NO_ABILITIES });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: /Chegada com a posição/ })).toBeNull();
  });
});

describe('quando a leitura não aparece', () => {
  it('sem o serviço de campo, só fica a conferência por toque', async () => {
    renderReading(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) }), null);
    await screen.findByRole('button', { name: 'Conferir CIL-001' });
    expect(screen.queryByLabelText('Código do cilindro')).toBeNull();
  });

  it('sem trip.operate, não oferece leitura nem conferência', async () => {
    renderReading(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) }), field(found(1)), { abilities: { ...NO_ABILITIES, exception: true } });
    await screen.findByRole('heading', { name: 'Conferência da carga' });
    expect(screen.queryByLabelText('Código do cilindro')).toBeNull();
  });

  it('a conferência por toque continua igual: o servidor assume "manual"', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: loading() })) });
    renderReading(service, field(found(1)));
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir CIL-001' }));
    await waitFor(() => expect(service.checkItem).toHaveBeenCalledWith(ORG, TRIP, 'i1', expect.any(String)));
  });
});
