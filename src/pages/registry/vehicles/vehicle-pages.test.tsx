import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { VehicleView } from '@/application/registry/registry-views';
import { VehicleDetailView, type VehicleAbilities } from './vehicle-detail-page';
import { VehicleFormView } from './vehicle-form-page';
import { VehicleListView } from './vehicle-list-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const VEHICLE = '85000000-0000-4000-8000-0000000000a1';
const OTHER = '85000000-0000-4000-8000-0000000000b2';
const ALL: VehicleAbilities = { write: true, deactivate: true, history: true };
const READ_ONLY: VehicleAbilities = { write: false, deactivate: false, history: false };

const vehicle = (over: Partial<VehicleView> = {}): VehicleView => ({
  id: VEHICLE, plate: 'ABC1234', vehicleType: 'truck', vehicleTypeDetail: null, brand: 'Marca', model: 'Modelo', manufactureYear: 2020, capacityCylinders: 30, maxLoadKg: 5000.5,
  licensingDueOn: '2027-01-31', licensingStatus: 'em_dia', status: 'available', version: 3, ...over,
});

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    history: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })), 
    getVehicle: vi.fn(async () => ({ kind: 'success' as const, value: vehicle() })),
    createVehicle: vi.fn(async () => ({ kind: 'success' as const, value: { id: VEHICLE, version: 1 } })),
    updateVehicle: vi.fn(async () => ({ kind: 'success' as const, value: { version: 4 } })),
    changeVehicleStatus: vi.fn(async () => ({ kind: 'success' as const, value: { version: 4 } })),
    listVehicles: vi.fn(async () => ({ kind: 'success' as const, value: { items: [vehicle(), vehicle({ id: OTHER, plate: 'ABC1D23', status: 'maintenance', licensingStatus: 'vencido' })], total: 2, next: null } })),
    ...overrides,
  } as unknown as RegistryService & Record<'getVehicle' | 'createVehicle' | 'updateVehicle' | 'changeVehicleStatus' | 'listVehicles', ReturnType<typeof vi.fn>>;
}

describe('formulário de veículo (história 4)', () => {
  const renderForm = (service: ReturnType<typeof fakeService> | null, extra: Record<string, unknown> = {}) => {
    const onNavigate = vi.fn();
    render(<VehicleFormView organizationId={ORG} service={service} online onNavigate={onNavigate} {...extra} />);
    return { onNavigate };
  };
  const fill = (): void => {
    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'abc1234' } });
    fireEvent.change(screen.getByLabelText('Tipo de veículo'), { target: { value: 'truck' } });
    fireEvent.change(screen.getByLabelText('Capacidade em cilindros'), { target: { value: '30' } });
  };

  it('normaliza a placa ao sair do campo e envia a placa normalizada', async () => {
    const service = fakeService();
    const { onNavigate } = renderForm(service);
    fill();
    fireEvent.blur(screen.getByLabelText('Placa'));
    expect(screen.getByLabelText('Placa')).toHaveValue('ABC-1234');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar veículo' }));
    await waitFor(() => expect(service.createVehicle).toHaveBeenCalledWith(ORG, expect.objectContaining({ plate: 'ABC1234', vehicleType: 'truck', capacityCylinders: 30 })));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/veiculos/${VEHICLE}`));
  });

  it('placa Mercosul permanece sem hífen', () => {
    renderForm(fakeService());
    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'abc1d23' } });
    fireEvent.blur(screen.getByLabelText('Placa'));
    expect(screen.getByLabelText('Placa')).toHaveValue('ABC1D23');
  });

  it('erros junto dos campos e foco no primeiro erro, sem enviar', async () => {
    const service = fakeService();
    renderForm(service);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar veículo' }));
    expect(await screen.findByText('Informe a placa no padrão ABC-1234 ou ABC1D23.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Placa')).toHaveFocus());
    expect(service.createVehicle).not.toHaveBeenCalled();
  });

  it('tipo "outro" pede a descrição', () => {
    renderForm(fakeService());
    fireEvent.change(screen.getByLabelText('Tipo de veículo'), { target: { value: 'other' } });
    expect(screen.getByLabelText('Qual tipo?')).toBeInTheDocument();
  });

  it('conflito de placa indica o veículo existente e leva até ele', async () => {
    renderForm(fakeService({ createVehicle: vi.fn(async () => ({ kind: 'plate_conflict', owner: { id: OTHER, label: 'ABC1234' } })) }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar veículo' }));
    expect(await screen.findByText('Esta placa já está cadastrada (ABC-1234).')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir o veículo que usa esta placa' })).toHaveAttribute('href', `/veiculos/${OTHER}`);
  });

  it('na edição, trocar a placa exige a justificativa', async () => {
    const service = fakeService();
    renderForm(service, { vehicleId: VEHICLE });
    await screen.findByRole('heading', { name: 'Editar veículo' });
    expect(screen.queryByLabelText('Justificativa da correção da placa')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'ZZZ9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Explique a correção da placa em 5 a 500 caracteres.')).toBeInTheDocument();
    expect(service.updateVehicle).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa da correção da placa'), { target: { value: 'Placa digitada errada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateVehicle).toHaveBeenCalledWith(ORG, VEHICLE, 3, expect.objectContaining({ plate: 'ZZZ9999' }), 'Placa digitada errada'));
  });

  it('veículo inativo não abre o formulário; conflito de versão pede para recarregar', async () => {
    const first = renderForm(fakeService({ getVehicle: vi.fn(async () => ({ kind: 'success', value: vehicle({ status: 'inactive' }) })) }), { vehicleId: VEHICLE });
    expect(await screen.findByText(/está inativo e não pode ser editado/)).toBeInTheDocument();
    expect(first.onNavigate).not.toHaveBeenCalled();
  });

  it('sem conexão a escrita fica desabilitada', () => {
    renderForm(fakeService(), { online: false });
    expect(screen.getByRole('button', { name: 'Cadastrar veículo' })).toBeDisabled();
  });
});

describe('lista de veículos (história 4)', () => {
  it('mostra placa formatada, situação e licenciamento sempre com texto', async () => {
    render(<VehicleListView organizationId={ORG} service={fakeService()} canCreate />);
    expect(await screen.findByText('2 veículos encontrados')).toHaveAttribute('role', 'status');
    const table = screen.getByRole('table', { name: 'Veículos da organização' });
    expect(within(table).getByRole('link', { name: 'ABC-1234' })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'ABC1D23' })).toBeInTheDocument();
    expect(within(table).getByText('Em manutenção')).toBeInTheDocument();
    expect(within(table).getByText('Vencido')).toBeInTheDocument();
    expect(within(table).getByText('Em dia')).toBeInTheDocument();
  });

  it('filtros chamam o serviço; estado vazio oferece o cadastro só a quem pode', async () => {
    const service = fakeService();
    const { unmount } = render(<VehicleListView organizationId={ORG} service={service} canCreate />);
    await screen.findByText('2 veículos encontrados');
    fireEvent.change(screen.getByLabelText('Situação do licenciamento'), { target: { value: 'a_vencer' } });
    fireEvent.change(screen.getByLabelText('Tipo de veículo'), { target: { value: 'van' } });
    await waitFor(() => expect(service.listVehicles).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ licensingStatus: 'a_vencer', vehicleType: 'van', status: 'active', limit: 25 })));
    unmount();
    const empty = fakeService({ listVehicles: vi.fn(async () => ({ kind: 'success', value: { items: [], total: 0, next: null } })) });
    const first = render(<VehicleListView organizationId={ORG} service={empty} canCreate={false} />);
    expect(await screen.findByText('Nenhum veículo encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cadastrar veículo' })).not.toBeInTheDocument();
    first.unmount();
    render(<VehicleListView organizationId={ORG} service={empty} canCreate />);
    expect((await screen.findAllByRole('link', { name: 'Cadastrar veículo' })).length).toBeGreaterThan(0);
  });
});

describe('detalhe do veículo (história 4)', () => {
  const renderDetail = (service: ReturnType<typeof fakeService> | null, can = ALL, online = true) =>
    render(<VehicleDetailView organizationId={ORG} service={service} online={online} vehicleId={VEHICLE} can={can} />);

  it('mostra os dados e as situações do veículo e do licenciamento em texto', async () => {
    renderDetail(fakeService());
    expect(await screen.findByRole('heading', { level: 2, name: 'Veículo ABC-1234' })).toBeInTheDocument();
    expect(screen.getByText('Caminhão')).toBeInTheDocument();
    expect(screen.getByText('31/01/2027')).toBeInTheDocument();
    expect(screen.getByText('Disponível')).toBeInTheDocument();
    expect(screen.getByText('Em dia')).toBeInTheDocument();
  });

  it('colocar em manutenção não pede justificativa, atualiza a situação e anuncia', async () => {
    const service = fakeService();
    service.getVehicle.mockResolvedValueOnce({ kind: 'success', value: vehicle() }).mockResolvedValue({ kind: 'success', value: vehicle({ status: 'maintenance', version: 4 }) });
    renderDetail(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Colocar em manutenção' }));
    await waitFor(() => expect(service.changeVehicleStatus).toHaveBeenCalledWith(ORG, VEHICLE, 3, 'maintenance', null));
    expect(await screen.findByText('Veículo colocado em manutenção.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Marcar como disponível' })).toBeInTheDocument();
  });

  it('inativar abre o diálogo, exige justificativa e devolve o foco ao acionador', async () => {
    const service = fakeService();
    renderDetail(service);
    const trigger = await screen.findByRole('button', { name: 'Inativar veículo' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Inativar veículo' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    expect(await within(dialog).findByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeInTheDocument();
    expect(service.changeVehicleStatus).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Veículo vendido' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar inativação' }));
    await waitFor(() => expect(service.changeVehicleStatus).toHaveBeenCalledWith(ORG, VEHICLE, 3, 'inactive', 'Veículo vendido'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('veículo inativo só oferece reativar, com justificativa, e não oferece edição', async () => {
    renderDetail(fakeService({ getVehicle: vi.fn(async () => ({ kind: 'success', value: vehicle({ status: 'inactive' }) })) }));
    await screen.findByRole('heading', { level: 2, name: 'Veículo ABC-1234' });
    expect(screen.queryByRole('link', { name: 'Editar veículo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Colocar em manutenção' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reativar veículo' }));
    expect(await screen.findByRole('dialog', { name: 'Reativar veículo' })).toBeInTheDocument();
  });

  it('sem permissão de situação ou de edição as ações não aparecem; offline desabilita', async () => {
    const first = renderDetail(fakeService(), READ_ONLY);
    await screen.findByRole('heading', { level: 2, name: 'Veículo ABC-1234' });
    expect(screen.queryByRole('link', { name: 'Editar veículo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar veículo' })).not.toBeInTheDocument();
    first.unmount();
    renderDetail(fakeService(), ALL, false);
    expect(await screen.findByRole('button', { name: 'Inativar veículo' })).toBeDisabled();
  });

  it('erros do servidor aparecem como mensagem; não encontrado e sem serviço têm estado próprio', async () => {
    const service = fakeService({ changeVehicleStatus: vi.fn(async () => ({ kind: 'version_conflict' })) });
    const first = renderDetail(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Colocar em manutenção' }));
    expect(await screen.findByText(/foi alterado por outra pessoa/)).toBeInTheDocument();
    first.unmount();
    const second = renderDetail(fakeService({ getVehicle: vi.fn(async () => ({ kind: 'not_found' })) }));
    expect(await screen.findByText('Veículo não encontrado')).toBeInTheDocument();
    second.unmount();
    renderDetail(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});
