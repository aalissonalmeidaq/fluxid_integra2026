import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { cylinder, detail, DRIVER, fakeTripService, ORG, SITE_1, TRIP, VEHICLE } from './trip-test-support';
import { TripFormView } from './trip-form-page';

const renderForm = (service: ReturnType<typeof fakeTripService> | null, extra: Record<string, unknown> = {}) => {
  const onNavigate = vi.fn();
  render(<TripFormView organizationId={ORG} service={service} online onNavigate={onNavigate} {...extra} />);
  return { onNavigate };
};

// Preenche o cabeçalho, escolhe a unidade e adiciona os cilindros indicados pela busca.
async function fillPlan(serials: string[] = ['CIL-001', 'CIL-002']): Promise<void> {
  await screen.findByLabelText('Veículo');
  fireEvent.change(screen.getByLabelText('Veículo'), { target: { value: VEHICLE } });
  fireEvent.change(screen.getByLabelText('Motorista'), { target: { value: DRIVER } });
  fireEvent.change(screen.getByLabelText('Unidade da parada 1'), { target: { value: SITE_1 } });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar cilindros à parada 1' }));
  for (const serial of serials) fireEvent.click(await screen.findByRole('button', { name: `Adicionar ${serial}` }));
}

describe('planejar viagem', () => {
  it('monta a viagem e envia uma vez, com um request_id', async () => {
    const service = fakeTripService();
    const { onNavigate } = renderForm(service);
    await fillPlan();
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    await waitFor(() => expect(service.createTrip).toHaveBeenCalledTimes(1));
    const [org, value, requestId] = service.createTrip.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(org).toBe(ORG);
    expect(value).toMatchObject({ vehicleId: VEHICLE, driverId: DRIVER, stops: [{ siteId: SITE_1, cylinderIds: [cylinder(1).id, cylinder(2).id] }] });
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/viagens/${TRIP}`));
  });

  it('erros junto dos campos e foco no primeiro erro, sem enviar', async () => {
    const service = fakeTripService();
    renderForm(service);
    await screen.findByLabelText('Veículo');
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    expect(await screen.findByText('Escolha o veículo.')).toBeInTheDocument();
    expect(screen.getByText('Escolha o motorista.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a unidade da parada.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Veículo')).toHaveFocus());
    expect(service.createTrip).not.toHaveBeenCalled();
  });

  it('recusa data passada na criação', async () => {
    renderForm(fakeTripService());
    await fillPlan();
    fireEvent.change(screen.getByLabelText('Data prevista'), { target: { value: '2020-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    expect(await screen.findByText('Escolha hoje ou uma data futura.')).toBeInTheDocument();
  });

  it('duplo clique não duplica: um único envio enquanto o primeiro não termina', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const createTrip = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    renderForm(fakeTripService({ createTrip }));
    await fillPlan();
    const button = screen.getByRole('button', { name: 'Planejar viagem' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(button.closest('form')!);
    expect(createTrip).toHaveBeenCalledTimes(1);
    finish({ kind: 'success', value: { tripId: TRIP, number: 1, version: 1 } });
  });

  it('cilindro reservado: diz em qual viagem e leva até ela', async () => {
    renderForm(fakeTripService({ createTrip: vi.fn(async () => ({ kind: 'cylinder_reserved', cylinderId: cylinder(1).id, trip: { id: 'outra-viagem', number: 4 } })) }));
    await fillPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    expect(await screen.findByText('Cilindro reservado por outra operação')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/CIL-001 foi reservado por outra operação, na viagem n.º 4/);
    expect(screen.getByRole('link', { name: 'Abrir a viagem n.º 4' })).toHaveAttribute('href', '/viagens/outra-viagem');
  });

  describe('reserva concorrente: outro operador reservou o cilindro entre a busca e a confirmação', () => {
    const conflict = (...ids: number[]) => ({
      kind: 'cylinder_reserved' as const, cylinderId: cylinder(ids[0]!).id, trip: { id: 'outra-viagem', number: 4 },
      conflicts: ids.map((n) => ({ cylinderId: cylinder(n).id, trip: { id: 'outra-viagem', number: 4 } })),
    });

    it('tira só o cilindro em conflito, avisa em texto claro e mantém todo o resto preenchido', async () => {
      const service = fakeTripService({ createTrip: vi.fn(async () => conflict(1)) });
      renderForm(service);
      await fillPlan(['CIL-001', 'CIL-002', 'CIL-003']);
      fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'levar rampa' } });
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Cilindro reservado por outra operação');
      expect(alert).toHaveTextContent(/CIL-001 foi reservado por outra operação, na viagem n\.º 4\./);
      expect(alert).toHaveTextContent(/Os demais dados foram mantidos/);
      expect(screen.queryByRole('button', { name: /^Tirar CIL-001 da parada/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Tirar CIL-002 da parada/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Tirar CIL-003 da parada/ })).toBeInTheDocument();
      expect(screen.getByLabelText('Veículo')).toHaveValue(VEHICLE);
      expect(screen.getByLabelText('Motorista')).toHaveValue(DRIVER);
      expect(screen.getByLabelText('Unidade da parada 1')).toHaveValue(SITE_1);
      expect(screen.getByLabelText('Observações')).toHaveValue('levar rampa');
      expect(screen.getByText('2 de 3')).toBeInTheDocument();
    });

    it('não recarrega a tela: o formulário é o mesmo e os dados não são pedidos de novo', async () => {
      const service = fakeTripService({ createTrip: vi.fn(async () => conflict(1)) });
      renderForm(service);
      await fillPlan();
      const form = screen.getByRole('button', { name: 'Planejar viagem' }).closest('form');
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      await screen.findByRole('alert');
      expect(screen.queryByText(/Carregando/i)).not.toBeInTheDocument();
      expect(form?.isConnected).toBe(true);
      expect(screen.getByRole('button', { name: 'Planejar viagem' }).closest('form')).toBe(form);
      expect(service.tripOptions).toHaveBeenCalledTimes(1);
    });

    it('o cilindro em conflito some da busca aberta, sem refazer a tela', async () => {
      renderForm(fakeTripService({ createTrip: vi.fn(async () => conflict(1)) }));
      await fillPlan(['CIL-001']);
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: 'Adicionar CIL-001' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Adicionar CIL-002' })).toBeInTheDocument();
    });

    it('o link da viagem em conflito navega dentro do app, sem recarregar a página', async () => {
      const { onNavigate } = renderForm(fakeTripService({ createTrip: vi.fn(async () => conflict(1)) }));
      await fillPlan();
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      const link = await screen.findByRole('link', { name: 'Abrir a viagem n.º 4' });
      expect(link).toHaveAttribute('href', '/viagens/outra-viagem');
      const notPrevented = fireEvent.click(link);
      expect(notPrevented).toBe(false);
      expect(onNavigate).toHaveBeenCalledWith('/viagens/outra-viagem');
    });

    it('sem a viagem (a pessoa não pode lê-la) o aviso não a revela e não oferece o link', async () => {
      renderForm(fakeTripService({ createTrip: vi.fn(async () => ({ kind: 'cylinder_reserved' as const, cylinderId: cylinder(1).id, conflicts: [{ cylinderId: cylinder(1).id }] })) }));
      await fillPlan();
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/CIL-001 foi reservado por outra operação\./);
      expect(alert).not.toHaveTextContent(/viagem n\.º/);
      expect(screen.queryByRole('link', { name: /Abrir a viagem/ })).not.toBeInTheDocument();
    });

    it('vários cilindros em conflito saem todos de uma vez e aparecem no aviso', async () => {
      renderForm(fakeTripService({ createTrip: vi.fn(async () => conflict(1, 3)) }));
      await fillPlan(['CIL-001', 'CIL-002', 'CIL-003']);
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/CIL-001 e CIL-003 foram reservados por outra operação/);
      expect(screen.queryByRole('button', { name: /^Tirar CIL-001 da parada/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Tirar CIL-003 da parada/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Tirar CIL-002 da parada/ })).toBeInTheDocument();
    });

    it('depois do aviso a pessoa confirma de novo só com o que sobrou e a viagem é planejada', async () => {
      const createTrip = vi.fn()
        .mockResolvedValueOnce(conflict(1))
        .mockResolvedValueOnce({ kind: 'success', value: { tripId: TRIP, number: 5, version: 1 } });
      const { onNavigate } = renderForm(fakeTripService({ createTrip }));
      await fillPlan();
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      await screen.findByRole('alert');
      fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
      await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(2));
      const [, second, secondRequest] = createTrip.mock.calls[1] as [string, { stops: { cylinderIds: string[] }[] }, string];
      const [, , firstRequest] = createTrip.mock.calls[0] as [string, unknown, string];
      expect(second.stops[0]!.cylinderIds).toEqual([cylinder(2).id]);
      expect(secondRequest).not.toBe(firstRequest);
      await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/viagens/${TRIP}`));
    });
  });

  it('cilindro sem teste em dia: diz o motivo em texto', async () => {
    renderForm(fakeTripService({ createTrip: vi.fn(async () => ({ kind: 'cylinder_not_eligible', cylinderId: cylinder(2).id, reason: 'hydro_expired' })) }));
    await fillPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/CIL-002: teste hidrostático vencido/);
  });

  it('acima da capacidade: o resumo mostra o excesso e o envio nem sai', async () => {
    const service = fakeTripService();
    renderForm(service);
    await fillPlan(['CIL-001', 'CIL-002', 'CIL-003']);
    expect(screen.getByText('3 de 3')).toBeInTheDocument();
    expect(screen.getByText('Ainda cabem 0 no veículo.')).toBeInTheDocument();
  });

  it('resultado desconhecido: orienta conferir a lista e a repetição reaproveita o mesmo request_id', async () => {
    const createTrip = vi.fn(async () => ({ kind: 'unknown' }));
    renderForm(fakeTripService({ createTrip }));
    await fillPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    expect(await screen.findByText('Resultado desconhecido')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(2));
    const ids = createTrip.mock.calls.map((call) => (call as unknown as unknown[])[2]);
    expect(ids[0]).toBe(ids[1]);
  });

  it('mudar o que vai ser enviado gera um novo request_id', async () => {
    const createTrip = vi.fn(async () => ({ kind: 'unknown' }));
    renderForm(fakeTripService({ createTrip }));
    await fillPlan();
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    await screen.findByText('Resultado desconhecido');
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'mudou' } });
    fireEvent.click(screen.getByRole('button', { name: 'Planejar viagem' }));
    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(2));
    const ids = createTrip.mock.calls.map((call) => (call as unknown as unknown[])[2]);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('sem conexão: o envio fica desabilitado, com o motivo, e nada é chamado', async () => {
    const service = fakeTripService();
    render(<TripFormView organizationId={ORG} service={service} online={false} />);
    await screen.findByLabelText('Veículo');
    expect(screen.getByText(/Sem conexão\. Esta operação exige conexão/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planejar viagem' })).toBeDisabled();
  });

  it('avisa de CNH e licenciamento vencidos sem impedir o planejamento', async () => {
    const service = fakeTripService({ tripOptions: vi.fn(async () => ({ kind: 'success', value: {
      vehicles: [{ id: VEHICLE, plate: 'ABC1234', capacityCylinders: 3, licensingDueOn: '2020-01-01', licensingStatus: 'vencido' }],
      drivers: [{ id: DRIVER, fullName: 'Motorista Alfa', cnhValidUntil: '2020-01-01', cnhStatus: 'vencido' }],
      sites: [{ id: SITE_1, name: 'Unidade Central', city: 'São Paulo', state: 'SP', customerId: 'c1', customerName: 'Alfa Saúde' }],
    } })) });
    renderForm(service);
    await fillPlan();
    expect(screen.getByText(/licenciamento do veículo está vencido/)).toBeInTheDocument();
    expect(screen.getByText(/CNH do motorista está vencida/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Planejar viagem' })).toBeEnabled();
  });

  it('tem uma única região de status, para os anúncios', async () => {
    renderForm(fakeTripService());
    await fillPlan();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Cilindro CIL-002 adicionado à parada.');
  });

  it('sem serviço mostra conexão indisponível', () => {
    renderForm(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});

describe('editar viagem', () => {
  it('carrega a viagem, mostra o que já está nela e envia com a versão', async () => {
    const service = fakeTripService();
    const { onNavigate } = renderForm(service, { tripId: TRIP });
    await screen.findByLabelText('Veículo');
    expect(screen.getByLabelText('Veículo')).toHaveValue(VEHICLE);
    expect(screen.getByText('CIL-001')).toBeInTheDocument();
    expect(screen.getByText('CIL-002')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar CIL-002 da parada 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateTrip).toHaveBeenCalledTimes(1));
    const call = service.updateTrip.mock.calls[0] as [string, string, number, { stops: Array<{ id?: string; cylinderIds: string[] }> }];
    expect(call[1]).toBe(TRIP);
    expect(call[2]).toBe(2);
    expect(call[3].stops[0]).toMatchObject({ id: '9a000000-0000-4000-8000-000000000001', cylinderIds: [cylinder(1).id] });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/viagens/${TRIP}`));
  });

  it('conflito de versão orienta recarregar', async () => {
    const service = fakeTripService({ updateTrip: vi.fn(async () => ({ kind: 'version_conflict' })) });
    renderForm(service, { tripId: TRIP });
    await screen.findByLabelText('Veículo');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Viagem alterada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar dados' }));
    await waitFor(() => expect(service.getTrip).toHaveBeenCalledTimes(2));
  });

  it('viagem que já saiu não abre para edição', async () => {
    renderForm(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: detail({ trip: { ...detail().trip, status: 'in_progress' } }) })) }), { tripId: TRIP });
    expect(await screen.findByText(/já saiu ou foi encerrada e não pode ser editada/)).toBeInTheDocument();
  });

  it('viagem de outra organização: "Viagem não encontrada"', async () => {
    renderForm(fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'not_found' })) }), { tripId: TRIP });
    expect(await screen.findByText('Viagem não encontrada')).toBeInTheDocument();
  });

  it('a data passada de uma viagem planejada é aceita na edição', async () => {
    const service = fakeTripService({ getTrip: vi.fn(async () => ({ kind: 'success', value: detail({ trip: { ...detail().trip, plannedDate: '2020-01-01' } }) })) });
    renderForm(service, { tripId: TRIP });
    await screen.findByLabelText('Veículo');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateTrip).toHaveBeenCalledTimes(1));
  });
});
