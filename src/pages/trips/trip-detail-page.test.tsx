import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { detail, fakeTripService, ORG, STOP_1, TRIP } from './trip-test-support';
import { NO_ABILITIES } from './trip-abilities';
import { TripDetailView } from './trip-detail-page';

const renderDetail = (service: ReturnType<typeof fakeTripService> | null, extra: Record<string, unknown> = {}) =>
  render(<TripDetailView organizationId={ORG} tripId={TRIP} service={service} online abilities={{ ...NO_ABILITIES, write: true }} {...extra} />);

describe('detalhe da viagem (planejada)', () => {
  it('mostra o cabeçalho, as paradas, os cilindros e as situações em texto', async () => {
    renderDetail(fakeTripService());
    expect(await screen.findByRole('heading', { name: 'Viagem n.º 7' })).toBeInTheDocument();
    expect(screen.getByText('Planejada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ABC-1234' })).toHaveAttribute('href', expect.stringMatching(/^\/veiculos\//));
    expect(screen.getByRole('link', { name: 'Motorista Alfa' })).toHaveAttribute('href', expect.stringMatching(/^\/motoristas\//));
    const stop = screen.getByRole('heading', { name: 'Parada 1' }).closest('li') as HTMLElement;
    expect(within(stop).getByText('CIL-001')).toBeInTheDocument();
    expect(within(stop).getAllByText('Planejado')).toHaveLength(2);
    expect(within(stop).getAllByText('Na organização')).toHaveLength(2);
    expect(within(stop).getByText('Teste hidrostático: A vencer')).toBeInTheDocument();
    expect(within(stop).getByRole('link', { name: 'Unidade Central' })).toBeInTheDocument();
    expect(screen.getByText('Levar rampa')).toBeInTheDocument();
  });

  it('o bloqueio aparece como "Bloqueado (lógico)", nunca como trava acionada', async () => {
    const base = detail();
    const items = base.items.map((item) => ({ ...item, itemStatus: 'in_transit' as const, lockStatus: 'locked' as const }));
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: detail({ trip: { ...base.trip, status: 'in_progress' }, items }) })) }));
    expect((await screen.findAllByText('Bloqueado (lógico)')).length).toBe(2);
    expect(screen.getAllByText('Em trânsito').length).toBeGreaterThanOrEqual(2);
  });

  it('viagem atrasada mostra a marca em texto', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: detail({ overdue: true }) })) }));
    expect(await screen.findByText('Atrasada')).toBeInTheDocument();
  });

  it('avisos de CNH e veículo aparecem em texto', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: detail({ warnings: ['cnh_expired', 'licensing_expiring'] }) })) }));
    expect(await screen.findByText(/CNH do motorista está vencida: a viagem não poderá ser iniciada/)).toBeInTheDocument();
    expect(screen.getByText('O licenciamento do veículo vence em breve.')).toBeInTheDocument();
  });

  it('só quem pode planejar vê "Editar viagem", e só enquanto a viagem não saiu', async () => {
    const { unmount } = renderDetail(fakeTripService());
    expect(await screen.findByRole('link', { name: 'Editar viagem' })).toHaveAttribute('href', `/viagens/${TRIP}/editar`);
    unmount();
    renderDetail(fakeTripService(), { abilities: NO_ABILITIES });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('link', { name: 'Editar viagem' })).not.toBeInTheDocument();
  });

  it('viagem em andamento ou encerrada não oferece edição; cancelada mostra o motivo', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: detail({ trip: { ...detail().trip, status: 'cancelled', cancelReason: 'Cliente desistiu' } }) })) }));
    expect(await screen.findByText('Cliente desistiu')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar viagem' })).not.toBeInTheDocument();
  });

  it('viagem de outra organização: "Viagem não encontrada"', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'not_found' })) }));
    expect(await screen.findByText('Viagem não encontrada')).toBeInTheDocument();
  });

  it('erro permite tentar de novo e sem conexão explica', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'success', value: detail() });
    renderDetail(fakeTripService({ getTrip }));
    (await screen.findByRole('button', { name: 'Tentar novamente' })).click();
    expect(await screen.findByRole('heading', { name: 'Viagem n.º 7' })).toBeInTheDocument();
  });

  it('sem conexão no carregamento mostra o motivo', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'offline' })) }));
    expect(await screen.findByText('Sem conexão. A consulta da viagem exige conexão.')).toBeInTheDocument();
  });
});

// ----- Carregamento e início (US2) -----

import { fireEvent, waitFor } from '@testing-library/react';

const OPERATOR = { ...NO_ABILITIES, write: true, operate: true, exception: true };
const withStatus = (status: 'planned' | 'loading' | 'in_progress', items?: ReturnType<typeof detail>['items']) =>
  detail({ trip: { ...detail().trip, status }, ...(items ? { items } : {}) });
const checkedAll = () => detail().items.map((item) => ({ ...item, itemStatus: 'checked' as const, checkedAt: '2026-10-09T14:00:00Z', checkedByName: 'Ana' }));

describe('detalhe: iniciar o carregamento', () => {
  it('quem opera vê "Iniciar carregamento" e a ação anuncia e recarrega', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'success', value: withStatus('planned') }).mockResolvedValue({ kind: 'success', value: withStatus('loading') });
    const service = fakeTripService({ getTrip, startLoading: vi.fn(async () => ({ kind: 'success', value: { version: 3 } })) });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar carregamento' }));
    await waitFor(() => expect(service.startLoading).toHaveBeenCalledWith(ORG, TRIP, 2, expect.stringMatching(/^[0-9a-f-]{36}$/)));
    expect(await screen.findByRole('heading', { name: 'Conferência da carga' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Carregamento iniciado.');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('sem trip.operate não há botões de operação; offline ficam desabilitados', async () => {
    const { unmount } = renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('planned') })) }), { abilities: { ...NO_ABILITIES, write: true } });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: 'Iniciar carregamento' })).not.toBeInTheDocument();
    unmount();
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('planned') })) }), { abilities: OPERATOR, online: false });
    expect(await screen.findByRole('button', { name: 'Iniciar carregamento' })).toBeDisabled();
    expect(screen.getAllByText(/exige conexão/).length).toBeGreaterThan(0);
  });

  it('veículo ocupado por outra viagem: recusa com link para a viagem que o ocupa', async () => {
    const service = fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('planned') })),
      startLoading: vi.fn(async () => ({ kind: 'resource_busy', entity: 'vehicle', trip: { id: 'outra', number: 3 } })),
    });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar carregamento' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O veículo já está na viagem n.º 3');
    expect(screen.getByRole('link', { name: 'Abrir a viagem n.º 3' })).toHaveAttribute('href', '/viagens/outra');
  });
});

describe('detalhe: conferir e iniciar a viagem', () => {
  it('"Iniciar viagem" fica desabilitado, com o motivo, enquanto falta conferir', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('loading') })) }), { abilities: OPERATOR });
    const start = await screen.findByRole('button', { name: 'Iniciar viagem' });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription('Faltam 2 cilindros para conferir.');
    expect(screen.getByRole('button', { name: 'Desfazer carregamento' })).toBeInTheDocument();
  });

  it('com tudo conferido o botão habilita, e o desfazer do carregamento some', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('loading', checkedAll()) })) }), { abilities: OPERATOR });
    expect(await screen.findByRole('button', { name: 'Iniciar viagem' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Desfazer carregamento' })).not.toBeInTheDocument();
    expect(screen.getByText('2 de 2 conferidos')).toBeInTheDocument();
  });

  it('conferir um cilindro chama o serviço, anuncia e recarrega', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'success', value: withStatus('loading') })
      .mockResolvedValue({ kind: 'success', value: withStatus('loading', [{ ...withStatus('loading').items[0]!, itemStatus: 'checked' as const, checkedAt: '2026-10-09T14:00:00Z' }, withStatus('loading').items[1]!]) });
    const service = fakeTripService({ getTrip, checkItem: vi.fn(async () => ({ kind: 'success', value: { checked: 1, total: 2 } })) });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir CIL-001' }));
    await waitFor(() => expect(service.checkItem).toHaveBeenCalledWith(ORG, TRIP, 'i1', expect.any(String)));
    expect(await screen.findByText('1 de 2 conferidos')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Cilindro CIL-001 conferido.');
  });

  it('iniciar com cilindro pendente destaca os que faltam em texto', async () => {
    const service = fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('loading', checkedAll()) })),
      startTrip: vi.fn(async () => ({ kind: 'items_pending', itemIds: ['i2'] })),
    });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta conferir cilindros');
  });

  it('CNH vencida na hora de iniciar explica o que fazer', async () => {
    renderDetail(fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('loading', checkedAll()) })),
      startTrip: vi.fn(async () => ({ kind: 'driver_license_expired' })),
    }), { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A CNH do motorista venceu');
  });

  it('teste vencido depois do planejamento aponta o cilindro e o motivo', async () => {
    renderDetail(fakeTripService({
      getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('loading', checkedAll()) })),
      startTrip: vi.fn(async () => ({ kind: 'cylinder_not_eligible', cylinderId: detail().items[1]!.cylinder.id, reason: 'hydro_expired' })),
    }), { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CIL-002: teste hidrostático vencido');
  });

  it('resultado desconhecido reaproveita o mesmo request_id na repetição', async () => {
    const startTrip = vi.fn(async () => ({ kind: 'unknown' }));
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('loading', checkedAll()) })), startTrip }), { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar viagem' }));
    await screen.findByText('Resultado desconhecido');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar viagem' }));
    await waitFor(() => expect(startTrip).toHaveBeenCalledTimes(2));
    const ids = startTrip.mock.calls.map((call) => (call as unknown as unknown[])[3]);
    expect(ids[0]).toBe(ids[1]);
  });

  it('viagem iniciada mostra bloqueado (lógico), em trânsito e o aviso da Fase 6', async () => {
    const items = checkedAll().map((item) => ({ ...item, itemStatus: 'in_transit' as const, lockStatus: 'locked' as const }));
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('in_progress', items) })) }), { abilities: OPERATOR });
    expect(await screen.findByText('Bloqueio lógico')).toBeInTheDocument();
    expect(screen.getByText(/Fase 6/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar viagem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Conferência da carga' })).not.toBeInTheDocument();
  });
});

describe('detalhe: retirar da viagem (exceção)', () => {
  it('abre o diálogo, exige justificativa e devolve o foco ao acionador', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'success', value: withStatus('loading') })
      .mockResolvedValue({ kind: 'success', value: withStatus('loading', [withStatus('loading').items[0]!, { ...withStatus('loading').items[1]!, itemStatus: 'removed' as const, divergenceReason: 'Avariado' }]) });
    const service = fakeTripService({ getTrip, removeItem: vi.fn(async () => ({ kind: 'success', value: { checked: 0, total: 1 } })) });
    renderDetail(service, { abilities: OPERATOR });
    const trigger = await screen.findByRole('button', { name: 'Retirar CIL-002 da viagem' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Retirar CIL-002 da viagem' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirar da viagem' }));
    expect(service.removeItem).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Cilindro avariado' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retirar da viagem' }));
    await waitFor(() => expect(service.removeItem).toHaveBeenCalledWith(ORG, TRIP, 'i2', 'Cilindro avariado', expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Cilindro CIL-002 retirado da viagem.');
    expect(screen.getByText('0 de 1 conferidos')).toBeInTheDocument();
  });

  it('sem trip.exception não há retirada', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('loading') })) }), { abilities: { ...OPERATOR, exception: false } });
    await screen.findByRole('heading', { name: 'Conferência da carga' });
    expect(screen.queryByRole('button', { name: /Retirar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferir CIL-001' })).toBeInTheDocument();
  });
});

// ----- Chegada e entrega (US3) -----

const inTransit = () => detail().items.map((item) => ({ ...item, itemStatus: 'in_transit' as const, lockStatus: 'locked' as const, checkedAt: '2026-10-09T14:00:00Z' }));
const stopWith = (status: 'pending' | 'on_site' | 'delivered' | 'with_divergence', extra: Partial<ReturnType<typeof detail>['stops'][number]> = {}) => [{ ...detail().stops[0]!, status, ...extra }];
const sailing = (status: 'pending' | 'on_site' | 'delivered' | 'with_divergence', extra: Partial<ReturnType<typeof detail>> = {}) =>
  detail({ trip: { ...detail().trip, status: 'in_progress', startedAt: '2026-10-09T14:00:00Z' }, stops: stopWith(status, status === 'pending' ? {} : { arrivedAt: '2026-10-09T15:00:00Z' }), items: inTransit(), ...extra });
const sailingService = (status: Parameters<typeof sailing>[0], overrides: Record<string, unknown> = {}, extra: Partial<ReturnType<typeof detail>> = {}) =>
  fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: sailing(status, extra) })), ...overrides });
const fillRecipient = (value = 'Recebedor Fictício'): void => { fireEvent.change(screen.getByLabelText('Nome de quem recebeu'), { target: { value } }); };

describe('detalhe: chegada à parada', () => {
  it('quem opera registra a chegada, com anúncio da chegada fora da ordem', async () => {
    const service = sailingService('pending', { arriveStop: vi.fn(async () => ({ kind: 'success', value: { outOfOrder: true } })) });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: /Registrar chegada à parada 1/ }));
    await waitFor(() => expect(service.arriveStop).toHaveBeenCalledWith(ORG, TRIP, STOP_1, expect.any(String)));
    expect(await screen.findByText('Chegada registrada na parada 1, fora da ordem planejada.')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('sem trip.operate não há botão de chegada nem de entrega', async () => {
    renderDetail(sailingService('pending'), { abilities: { ...NO_ABILITIES, write: true } });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: /Registrar chegada/ })).not.toBeInTheDocument();
  });

  it('uma parada que já chegou oferece "Registrar entrega" e mostra "Chegada fora da ordem"', async () => {
    renderDetail(sailingService('on_site', {}, { stops: stopWith('on_site', { arrivedAt: '2026-10-09T15:00:00Z', outOfOrder: true }) }), { abilities: OPERATOR });
    expect(await screen.findByRole('button', { name: 'Registrar entrega da parada 1' })).toBeInTheDocument();
    expect(screen.getByText('Chegada fora da ordem')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar chegada/ })).not.toBeInTheDocument();
  });
});

describe('detalhe: registrar a entrega', () => {
  it('abre o diálogo, envia o recebimento e fecha anunciando o resultado', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'success', value: sailing('on_site') }).mockResolvedValue({ kind: 'success', value: sailing('delivered') });
    const service = fakeTripService({ getTrip, registerDelivery: vi.fn(async () => ({ kind: 'success', value: { deliveryId: 'd1', stopStatus: 'delivered', outsideGeofence: true } })) });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrega da parada 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar entrega · Parada 1' });
    fillRecipient();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrega' }));
    await waitFor(() => expect(service.registerDelivery).toHaveBeenCalledTimes(1));
    const call = service.registerDelivery.mock.calls[0] as unknown as [string, string, string, { recipientName: string; results: unknown[] }, string | undefined, string];
    expect([call[0], call[1], call[2]]).toEqual([ORG, TRIP, STOP_1]);
    expect(call[3].recipientName).toBe('Recebedor Fictício');
    expect(call[3].results).toHaveLength(2);
    expect(call[4]).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Entrega registrada na parada 1. Atenção: a posição está fora da geocerca da unidade.');
  });

  it('erro de campo do servidor aparece dentro do diálogo e o diálogo continua aberto', async () => {
    const service = sailingService('on_site', { registerDelivery: vi.fn(async () => ({ kind: 'invalid', fields: { recipient_name: 'Informe o nome de quem recebeu.' } })) });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrega da parada 1' }));
    fillRecipient();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar entrega' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Informe o nome de quem recebeu.')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Revise os campos indicados.');
  });

  it('parada já fechada por outra pessoa: o motivo aparece no diálogo e os dados são recarregados', async () => {
    const service = sailingService('on_site', { registerDelivery: vi.fn(async () => ({ kind: 'stop_closed' })) });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrega da parada 1' }));
    fillRecipient();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar entrega' }));
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent('Esta parada já foi encerrada');
    await waitFor(() => expect(service.getTrip.mock.calls.length).toBeGreaterThan(1));
  });

  it('o nome do recebedor não fica em lugar nenhum depois de fechar', async () => {
    const service = sailingService('on_site', { registerDelivery: vi.fn(async () => ({ kind: 'success', value: { deliveryId: 'd1', stopStatus: 'delivered', outsideGeofence: null } })) });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrega da parada 1' }));
    fillRecipient('Nome-sigiloso-do-recebedor');
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar entrega' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain('Nome-sigiloso-do-recebedor');
    expect(globalThis.localStorage.length + globalThis.sessionStorage.length).toBe(0);
    expect(window.location.href).not.toContain('sigiloso');
  });
});

const delivered = (name: string, extra: Partial<ReturnType<typeof detail>['deliveries'][number]> = {}) => ({
  id: 'd1', stopId: STOP_1, deliveredAt: '2026-10-09T15:30:00Z', recipientName: name, recipientRole: 'Enfermeira', latitude: null, longitude: null, atSiteAddress: false, outsideGeofence: null,
  results: [{ itemId: 'i1', delivered: true, reason: null }, { itemId: 'i2', delivered: false, reason: 'Sem espaço' }], supersedesId: null, recordedByName: 'Ana', recordedAt: '2026-10-09T15:31:00Z', ...extra,
});

describe('detalhe: divergência, correção e leitura do recebedor', () => {
  const items = () => inTransit().map((item, index) => (index === 1 ? { ...item, itemStatus: 'not_delivered' as const, divergenceReason: 'Sem espaço' } : { ...item, itemStatus: 'delivered' as const }));

  it('mostra a divergência em texto e a entrega registrada com o recebedor', async () => {
    renderDetail(sailingService('with_divergence', {}, { items: items(), deliveries: [delivered('Recebedor Fictício', { outsideGeofence: true })] }), { abilities: OPERATOR });
    expect(await screen.findByText('Entrega registrada')).toBeInTheDocument();
    expect(screen.getByText(/recebido por Recebedor Fictício \(Enfermeira\)/)).toBeInTheDocument();
    expect(screen.getByText('Posição fora da geocerca da unidade.')).toBeInTheDocument();
    expect(screen.getByText('Não entregue')).toBeInTheDocument();
    expect(screen.getByText('Motivo: Sem espaço')).toBeInTheDocument();
    expect(screen.getByText('Com divergência')).toBeInTheDocument();
  });

  it('quem não tem trip.recipient vê "(restrito)" no lugar do nome', async () => {
    renderDetail(sailingService('delivered', {}, { items: items(), deliveries: [delivered('(restrito)', { recipientRole: '(restrito)' })] }), { abilities: { ...OPERATOR } });
    expect(await screen.findByText(/recebido por \(restrito\)$/)).toBeInTheDocument();
    expect(screen.queryByText(/Enfermeira/)).not.toBeInTheDocument();
  });

  it('a correção abre com o registro anterior à vista e envia o registro que corrige', async () => {
    const service = sailingService('with_divergence', { registerDelivery: vi.fn(async () => ({ kind: 'success', value: { deliveryId: 'd2', stopStatus: 'delivered', outsideGeofence: null } })) },
      { items: items(), deliveries: [delivered('Recebedor Fictício')] });
    renderDetail(service, { abilities: OPERATOR });
    fireEvent.click(await screen.findByRole('button', { name: 'Corrigir a entrega da parada 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Corrigir entrega · Parada 1' });
    expect(within(dialog).getByText(/Registro anterior/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('radiogroup', { name: 'Resultado de CIL-001' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar correção' }));
    await waitFor(() => expect(service.registerDelivery).toHaveBeenCalledTimes(1));
    const call = service.registerDelivery.mock.calls[0] as unknown as [string, string, string, { results: Array<{ itemId: string; delivered: boolean }> }, string];
    expect(call[3].results).toEqual([{ itemId: 'i2', delivered: true }]);
    expect(call[4]).toBe('d1');
  });

  it('depois de uma correção só o registro mais recente é mostrado, e a contagem de correções aparece', async () => {
    renderDetail(sailingService('delivered', {}, { items: inTransit().map((item) => ({ ...item, itemStatus: 'delivered' as const })), deliveries: [
      delivered('Primeiro Recebedor'), delivered('Segundo Recebedor', { id: 'd2', supersedesId: 'd1', recordedAt: '2026-10-09T16:00:00Z' }),
    ] }), { abilities: OPERATOR });
    expect(await screen.findByText('Entrega registrada (corrigida)')).toBeInTheDocument();
    expect(screen.getByText(/recebido por Segundo Recebedor/)).toBeInTheDocument();
    expect(screen.queryByText(/Primeiro Recebedor/)).not.toBeInTheDocument();
    expect(screen.getByText('1 correção registrada; os registros anteriores ficam no histórico.')).toBeInTheDocument();
  });

  it('viagem que não está em andamento não oferece chegada, entrega nem correção', async () => {
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: sailing('delivered', { trip: { ...detail().trip, status: 'completed' }, deliveries: [delivered('Recebedor Fictício')] }) })) }), { abilities: OPERATOR });
    await screen.findByText('Entrega registrada');
    expect(screen.queryByRole('button', { name: /Corrigir|Registrar (chegada|entrega)/ })).not.toBeInTheDocument();
  });
});

// ----- Desbloqueio (US4) -----

describe('detalhe: registrar o desbloqueio', () => {
  const UNLOCKER = { ...NO_ABILITIES, operate: true, unlock: true };
  const lockedItems = (statuses: Array<'delivered' | 'in_transit'>) => detail().items.map((item, index) => ({ ...item, itemStatus: statuses[index]!, lockStatus: 'locked' as const }));
  const withLocked = (statuses: Array<'delivered' | 'in_transit'>) => sailing('delivered', { items: lockedItems(statuses) });

  it('só quem tem trip.unlock vê a ação, no item bloqueado', async () => {
    const { unmount } = renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withLocked(['delivered', 'delivered']) })) }), { abilities: UNLOCKER });
    expect(await screen.findByRole('button', { name: 'Registrar desbloqueio de CIL-001' })).toBeInTheDocument();
    unmount();
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withLocked(['delivered', 'delivered']) })) }), { abilities: { ...NO_ABILITIES, operate: true } });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: /Registrar desbloqueio/ })).not.toBeInTheDocument();
  });

  it('o cilindro ainda em trânsito só oferece o desbloqueio a quem também tem a exceção', async () => {
    const getTrip = vi.fn(async () => ({ kind: 'success', value: withLocked(['delivered', 'in_transit']) }));
    const { unmount } = renderDetail(fakeTripService({ getTrip }), { abilities: UNLOCKER });
    await screen.findByRole('button', { name: 'Registrar desbloqueio de CIL-001' });
    expect(screen.queryByRole('button', { name: 'Registrar desbloqueio de CIL-002' })).not.toBeInTheDocument();
    unmount();
    renderDetail(fakeTripService({ getTrip }), { abilities: { ...UNLOCKER, exception: true } });
    expect(await screen.findByRole('button', { name: 'Registrar desbloqueio de CIL-002' })).toBeInTheDocument();
  });

  it('item já desbloqueado ou nunca bloqueado não tem a ação', async () => {
    const items = detail().items.map((item, index) => ({ ...item, itemStatus: 'delivered' as const, lockStatus: index === 0 ? ('unlocked' as const) : ('none' as const) }));
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: sailing('delivered', { items }) })) }), { abilities: UNLOCKER });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: /Registrar desbloqueio/ })).not.toBeInTheDocument();
    expect(screen.getByText('Desbloqueado')).toBeInTheDocument();
  });

  it('desbloqueio normal: abre o diálogo, envia sem justificativa e anuncia que a entrega não mudou', async () => {
    const registerUnlock = vi.fn(async () => ({ kind: 'success', value: { exceptional: false } }));
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withLocked(['delivered', 'delivered']) })), registerUnlock }), { abilities: UNLOCKER });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar desbloqueio de CIL-001' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar desbloqueio' }));
    await waitFor(() => expect(registerUnlock).toHaveBeenCalledWith(ORG, TRIP, 'i1', null, expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Desbloqueio de CIL-001 registrado. A situação da entrega não mudou.');
  });

  it('o servidor exige o segundo fator: a mensagem aparece dentro do diálogo e o diálogo continua aberto', async () => {
    const registerUnlock = vi.fn(async () => ({ kind: 'mfa_required' }));
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withLocked(['delivered', 'delivered']) })), registerUnlock }), { abilities: UNLOCKER });
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar desbloqueio de CIL-001' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar desbloqueio' }));
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent('exige a verificação em duas etapas');
  });
});

// ----- Encerramento (US5) -----

describe('detalhe: concluir a viagem', () => {
  const FULL = { ...NO_ABILITIES, write: true, operate: true, exception: true, cancel: true };
  const deliveredAll = () => inTransit().map((item) => ({ ...item, itemStatus: 'delivered' as const }));

  it('"Concluir viagem" fica desabilitado, com o motivo, enquanto há parada aberta', async () => {
    renderDetail(sailingService('on_site'), { abilities: FULL });
    const complete = await screen.findByRole('button', { name: 'Concluir viagem' });
    expect(complete).toBeDisabled();
    expect(complete).toHaveAccessibleDescription('Falta encerrar 1 parada: registre a entrega ou a divergência.');
  });

  it('cilindro não entregue sem decisão também impede, em texto', async () => {
    const items = inTransit().map((item, index) => (index === 1 ? { ...item, itemStatus: 'not_delivered' as const, divergenceReason: 'Sem espaço' } : { ...item, itemStatus: 'delivered' as const }));
    renderDetail(sailingService('with_divergence', {}, { items }), { abilities: FULL });
    expect(await screen.findByRole('button', { name: 'Concluir viagem' })).toHaveAccessibleDescription('1 cilindro ainda sem decisão: corrija a entrega ou devolva ao estoque.');
  });

  it('com tudo encerrado habilita, conclui, anuncia e recarrega', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'success', value: sailing('delivered', { items: deliveredAll() }) })
      .mockResolvedValue({ kind: 'success', value: sailing('delivered', { trip: { ...detail().trip, status: 'completed' }, items: deliveredAll() }) });
    const service = fakeTripService({ getTrip, completeTrip: vi.fn(async () => ({ kind: 'success', value: { version: 4 } })) });
    renderDetail(service, { abilities: FULL });
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir viagem' }));
    await waitFor(() => expect(service.completeTrip).toHaveBeenCalledWith(ORG, TRIP, 2, expect.any(String)));
    expect(await screen.findByText('Concluída')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Viagem concluída.');
    expect(screen.queryByRole('button', { name: 'Concluir viagem' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar viagem' })).not.toBeInTheDocument();
  });

  it('o servidor aponta as paradas em aberto', async () => {
    const service = sailingService('delivered', { completeTrip: vi.fn(async () => ({ kind: 'stops_open', stopIds: [STOP_1] })) }, { items: deliveredAll() });
    renderDetail(service, { abilities: FULL });
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ainda há parada sem entrega ou divergência registrada');
  });

  it('sem trip.operate não há "Concluir viagem"', async () => {
    renderDetail(sailingService('delivered', {}, { items: deliveredAll() }), { abilities: { ...NO_ABILITIES, cancel: true, exception: true } });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: 'Concluir viagem' })).not.toBeInTheDocument();
  });
});

describe('detalhe: cancelar a viagem', () => {
  const CANCELLER = { ...NO_ABILITIES, cancel: true };

  it('planejada: o gestor cancela com justificativa e a lista de ações some', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'success', value: withStatus('planned') })
      .mockResolvedValue({ kind: 'success', value: detail({ trip: { ...detail().trip, status: 'cancelled', cancelReason: 'Cliente desistiu da entrega' } }) });
    const service = fakeTripService({ getTrip, cancelTrip: vi.fn(async () => ({ kind: 'success', value: { version: 3, released: 2, inTransit: 0 } })) });
    renderDetail(service, { abilities: CANCELLER });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar viagem' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar a viagem n.º 7' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar viagem' }));
    expect(service.cancelTrip).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Cliente desistiu da entrega' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar viagem' }));
    await waitFor(() => expect(service.cancelTrip).toHaveBeenCalledWith(ORG, TRIP, 2, 'Cliente desistiu da entrega', expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Viagem cancelada.');
    expect(screen.getByText('Cliente desistiu da entrega')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar viagem' })).not.toBeInTheDocument();
  });

  it('em andamento só aparece a quem também tem a exceção, e o aviso fala do que fica em trânsito', async () => {
    const { unmount } = renderDetail(sailingService('pending'), { abilities: CANCELLER });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: 'Cancelar viagem' })).not.toBeInTheDocument();
    unmount();
    const registerCancel = vi.fn(async () => ({ kind: 'success', value: { version: 3, released: 0, inTransit: 2 } }));
    renderDetail(sailingService('pending', { cancelTrip: registerCancel }), { abilities: { ...CANCELLER, exception: true } });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar viagem' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/continuam em trânsito até você registrar o retorno ao estoque/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Cliente suspendeu' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar viagem' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 cilindros continuam em trânsito até o retorno ao estoque.'));
  });

  it('a recusa do servidor aparece dentro do diálogo', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: withStatus('planned') })), cancelTrip: vi.fn(async () => ({ kind: 'access_denied' })) });
    renderDetail(service, { abilities: CANCELLER });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar viagem' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Cliente desistiu' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar viagem' }));
    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent('Você não tem permissão para esta ação.');
  });
});

describe('detalhe: devolver ao estoque', () => {
  const RETURNER = { ...NO_ABILITIES, operate: true, exception: true };
  const notDelivered = () => inTransit().map((item, index) => (index === 1 ? { ...item, itemStatus: 'not_delivered' as const, divergenceReason: 'Sem espaço' } : { ...item, itemStatus: 'delivered' as const }));

  it('oferece a ação no cilindro em trânsito ou não entregue, a quem tem a exceção', async () => {
    renderDetail(sailingService('with_divergence', {}, { items: notDelivered() }), { abilities: RETURNER });
    expect(await screen.findByRole('button', { name: 'Devolver CIL-002 ao estoque' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Devolver CIL-001 ao estoque' })).not.toBeInTheDocument();
  });

  it('sem trip.exception não há devolução', async () => {
    renderDetail(sailingService('with_divergence', {}, { items: notDelivered() }), { abilities: { ...NO_ABILITIES, operate: true } });
    await screen.findByRole('heading', { name: 'Viagem n.º 7' });
    expect(screen.queryByRole('button', { name: /Devolver/ })).not.toBeInTheDocument();
  });

  it('numa viagem cancelada em andamento o que ficou em trânsito ainda pode voltar', async () => {
    const cancelled = detail({ trip: { ...detail().trip, status: 'cancelled', cancelReason: 'Cliente suspendeu' }, stops: stopWith('pending'), items: inTransit() });
    renderDetail(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: cancelled })) }), { abilities: RETURNER });
    expect(await screen.findByRole('button', { name: 'Devolver CIL-001 ao estoque' })).toBeInTheDocument();
  });

  it('pede a justificativa, devolve e anuncia', async () => {
    const getTrip = vi.fn().mockResolvedValueOnce({ kind: 'success', value: sailing('with_divergence', { items: notDelivered() }) })
      .mockResolvedValue({ kind: 'success', value: sailing('with_divergence', { items: notDelivered().map((item) => (item.itemStatus === 'not_delivered' ? { ...item, itemStatus: 'returned' as const } : item)) }) });
    const service = fakeTripService({ getTrip, returnItem: vi.fn(async () => ({ kind: 'success', value: true })) });
    renderDetail(service, { abilities: RETURNER });
    fireEvent.click(await screen.findByRole('button', { name: 'Devolver CIL-002 ao estoque' }));
    const dialog = await screen.findByRole('dialog', { name: 'Devolver CIL-002 ao estoque' });
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Cliente não aceitou' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Devolver ao estoque' }));
    await waitFor(() => expect(service.returnItem).toHaveBeenCalledWith(ORG, TRIP, 'i2', 'Cliente não aceitou', expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Cilindro CIL-002 devolvido ao estoque.');
    expect(screen.getByText('Devolvido ao estoque')).toBeInTheDocument();
  });
});
