import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { DriverDetail, DriverView } from '@/application/registry/registry-views';
import { DriverDetailView, type DriverAbilities } from './driver-detail-page';
import { DriverFormView } from './driver-form-page';
import { DriverListView } from './driver-list-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const DRIVER = '86000000-0000-4000-8000-0000000000a1';
const OTHER = '86000000-0000-4000-8000-0000000000b2';
const USER = '10000000-0000-4000-8000-0000000000e1';
// Documentos fictícios gerados para a suíte.
const CPF = '52998224725';
const CNH = '12345678900';

const ALL: DriverAbilities = { write: true, deactivate: true, document: true, history: true, anonymize: true };
const AUDITOR: DriverAbilities = { write: false, deactivate: false, document: false, history: true, anonymize: false };

const driver = (over: Partial<DriverView> = {}): DriverView => ({
  id: DRIVER, fullName: 'Carlos Motorista', cpfDisplay: '***.***.***-25', cnhDisplay: '********900', cnhCategory: 'B', cnhValidUntil: '2030-01-31', cnhStatus: 'em_dia', status: 'active',
  version: 3, linked: false, anonymizedAt: null, phone: '11987654321', ...over,
});
const detail = (over: Partial<DriverView> = {}, linkedUser: DriverDetail['linkedUser'] = null): DriverDetail => ({ driver: driver(over), linkedUser });

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    history: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })), 
    getDriver: vi.fn(async () => ({ kind: 'success' as const, value: detail() })),
    listLinkableUsers: vi.fn(async () => ({ kind: 'success' as const, value: [{ id: USER, displayName: 'Condutor Um' }] })),
    createDriver: vi.fn(async () => ({ kind: 'success' as const, value: { id: DRIVER, version: 1 } })),
    updateDriver: vi.fn(async () => ({ kind: 'success' as const, value: { version: 4 } })),
    linkDriverUser: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3 } })),
    unlinkDriverUser: vi.fn(async () => ({ kind: 'success' as const, value: { version: 3 } })),
    revealDocument: vi.fn(async (_org: string, _type: string, _id: string, document: string) => ({ kind: 'success' as const, value: document === 'cpf' ? CPF : CNH })),
    listDrivers: vi.fn(async () => ({ kind: 'success' as const, value: { items: [driver(), driver({ id: OTHER, fullName: 'Maria Condutora', cnhStatus: 'vencido', linked: true })], total: 2, next: null } })),
    ...overrides,
  } as unknown as RegistryService & Record<string, ReturnType<typeof vi.fn>>;
}

describe('formulário de motorista (história 5)', () => {
  const renderForm = (service: ReturnType<typeof fakeService> | null, extra: Record<string, unknown> = {}) => {
    const onNavigate = vi.fn();
    render(<DriverFormView organizationId={ORG} service={service} online onNavigate={onNavigate} {...extra} />);
    return { onNavigate };
  };
  const fill = (): void => {
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: ' Carlos Motorista ' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '529.982.247-25' } });
    fireEvent.change(screen.getByLabelText('Número da CNH'), { target: { value: CNH } });
    fireEvent.change(screen.getByLabelText('Categoria da CNH'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('Validade da CNH'), { target: { value: '2030-01-31' } });
  };

  it('envia o cadastro com os documentos só com dígitos e abre o detalhe', async () => {
    const service = fakeService();
    const { onNavigate } = renderForm(service);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar motorista' }));
    await waitFor(() => expect(service.createDriver).toHaveBeenCalledWith(ORG, expect.objectContaining({ fullName: 'Carlos Motorista', cpf: CPF, cnhNumber: CNH, cnhCategory: 'B', cnhValidUntil: '2030-01-31' })));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/motoristas/${DRIVER}`));
  });

  it('vínculo opcional: escolhe entre os usuários vinculáveis e vincula depois do cadastro', async () => {
    const service = fakeService();
    renderForm(service);
    fill();
    fireEvent.change(await screen.findByLabelText('Usuário vinculado'), { target: { value: USER } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar motorista' }));
    await waitFor(() => expect(service.linkDriverUser).toHaveBeenCalledWith(ORG, DRIVER, USER));
  });

  it('erros junto dos campos e foco no primeiro erro, sem enviar', async () => {
    const service = fakeService();
    renderForm(service);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar motorista' }));
    expect(await screen.findByText('Informe o nome com 2 a 160 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Informe um CPF válido.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nome completo')).toHaveFocus());
    expect(service.createDriver).not.toHaveBeenCalled();
  });

  it('conflito de CPF indica o motorista existente sem mostrar o documento', async () => {
    renderForm(fakeService({ createDriver: vi.fn(async () => ({ kind: 'document_conflict', conflictField: 'cpf', owner: { id: OTHER, label: 'Maria Condutora' } })) }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar motorista' }));
    expect(await screen.findByText('Este CPF já está cadastrado em Maria Condutora.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir o motorista que usa este documento' })).toHaveAttribute('href', `/motoristas/${OTHER}`);
    expect(document.body.textContent).not.toContain(CPF);
  });

  it('conflito de CNH aponta o campo da CNH', async () => {
    renderForm(fakeService({ createDriver: vi.fn(async () => ({ kind: 'document_conflict', conflictField: 'cnh_number', owner: { id: OTHER, label: 'Maria Condutora' } })) }));
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar motorista' }));
    expect(await screen.findByText('Este número de CNH já está cadastrado em Maria Condutora.')).toBeInTheDocument();
  });

  it('a edição não pré-preenche o documento: mostra só a máscara e, em branco, nada de documento é enviado', async () => {
    const service = fakeService();
    renderForm(service, { driverId: DRIVER });
    await screen.findByRole('heading', { name: 'Editar motorista' });
    expect(screen.getByLabelText('CPF')).toHaveValue('');
    expect(screen.getByLabelText('CPF')).toHaveAttribute('placeholder', '***.***.***-25');
    expect(screen.getByLabelText('Número da CNH')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Carlos Silva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateDriver).toHaveBeenCalledWith(ORG, DRIVER, 3, expect.objectContaining({ fullName: 'Carlos Silva', cpf: null, cnhNumber: null, justification: null })));
  });

  it('na edição, documento novo exige justificativa', async () => {
    const service = fakeService();
    renderForm(service, { driverId: DRIVER });
    await screen.findByRole('heading', { name: 'Editar motorista' });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '111.444.777-35' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Explique a correção do documento em 5 a 500 caracteres.')).toBeInTheDocument();
    expect(service.updateDriver).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa da correção do documento'), { target: { value: 'Digitado errado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateDriver).toHaveBeenCalledWith(ORG, DRIVER, 3, expect.objectContaining({ cpf: '11144477735', justification: 'Digitado errado' })));
  });

  it('motorista inativo não abre o formulário', async () => {
    renderForm(fakeService({ getDriver: vi.fn(async () => ({ kind: 'success', value: detail({ status: 'inactive' }) })) }), { driverId: DRIVER });
    expect(await screen.findByText(/está inativo e não pode ser editado/)).toBeInTheDocument();
  });
});

describe('lista de motoristas (história 5)', () => {
  it('mostra os documentos mascarados e as situações em texto', async () => {
    render(<DriverListView organizationId={ORG} service={fakeService()} canCreate />);
    expect(await screen.findByText('2 motoristas encontrados')).toHaveAttribute('role', 'status');
    const table = screen.getByRole('table', { name: 'Motoristas da organização' });
    expect(within(table).getAllByText('***.***.***-25')).toHaveLength(2);
    expect(within(table).getByText('Vencido')).toBeInTheDocument();
    expect(within(table).getByText('Em dia')).toBeInTheDocument();
    expect(within(table).getByText('Vinculado')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(CPF);
  });

  it('filtros chamam o serviço', async () => {
    const service = fakeService();
    render(<DriverListView organizationId={ORG} service={service} canCreate={false} />);
    await screen.findByText('2 motoristas encontrados');
    fireEvent.change(screen.getByLabelText('Situação da CNH'), { target: { value: 'vencido' } });
    fireEvent.change(screen.getByLabelText('Usuário vinculado'), { target: { value: 'yes' } });
    await waitFor(() => expect(service.listDrivers).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ cnhStatus: 'vencido', linked: true, status: 'active' })));
    expect(screen.queryByRole('link', { name: 'Cadastrar motorista' })).not.toBeInTheDocument();
  });
});

describe('detalhe do motorista (história 5)', () => {
  const renderDetail = (service: ReturnType<typeof fakeService> | null, can: DriverAbilities = ALL, online = true) =>
    render(<DriverDetailView organizationId={ORG} service={service} online={online} driverId={DRIVER} can={can} />);

  it('CPF e CNH aparecem mascarados; revelar mostra o valor e ocultar o descarta', async () => {
    const service = fakeService();
    renderDetail(service);
    expect(await screen.findByText('***.***.***-25')).toBeInTheDocument();
    expect(screen.getByText('********900')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CPF' }));
    expect(await screen.findByText('529.982.247-25')).toBeInTheDocument();
    expect(service.revealDocument).toHaveBeenCalledWith(ORG, 'driver', DRIVER, 'cpf');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar CPF' }));
    expect(screen.queryByText('529.982.247-25')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revelar CNH' }));
    expect(await screen.findByText(CNH)).toBeInTheDocument();
  });

  it('o auditor não vê o botão de revelar nem as ações de escrita', async () => {
    renderDetail(fakeService(), AUDITOR);
    await screen.findByRole('heading', { level: 2, name: 'Carlos Motorista' });
    expect(screen.queryByRole('button', { name: 'Revelar CPF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar motorista' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular usuário' })).not.toBeInTheDocument();
  });

  it('situação da CNH com texto e ícone', async () => {
    renderDetail(fakeService({ getDriver: vi.fn(async () => ({ kind: 'success', value: detail({ cnhStatus: 'a_vencer' }) })) }));
    expect(await screen.findByText('A vencer')).toBeInTheDocument();
    expect(screen.getByText('CNH:')).toBeInTheDocument();
  });

  it('vincula um usuário escolhido entre os vinculáveis e atualiza a tela', async () => {
    const service = fakeService();
    (service.getDriver as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: 'success', value: detail() }).mockResolvedValue({ kind: 'success', value: detail({ linked: true }, { id: USER, displayName: 'Condutor Um', active: true }) });
    renderDetail(service);
    const escolha = await screen.findByLabelText('Usuário vinculável');
    // As opções chegam depois do campo: escolher antes de elas existirem não seleciona nada.
    await waitFor(() => expect(escolha.querySelector(`option[value="${USER}"]`)).not.toBeNull());
    fireEvent.change(escolha, { target: { value: USER } });
    const vincular = await screen.findByRole('button', { name: 'Vincular usuário' });
    await waitFor(() => expect(vincular).toBeEnabled());
    fireEvent.click(vincular);
    await waitFor(() => expect(service.linkDriverUser).toHaveBeenCalledWith(ORG, DRIVER, USER));
    expect(await screen.findByText('Usuário vinculado ao motorista.')).toBeInTheDocument();
    expect(await screen.findByText('Condutor Um')).toBeInTheDocument();
  });

  it('vínculo recusado mostra a mensagem, sem revelar se o usuário existe em outra organização', async () => {
    renderDetail(fakeService({ linkDriverUser: vi.fn(async () => ({ kind: 'user_not_eligible' })) }));
    const escolha = await screen.findByLabelText('Usuário vinculável');
    // As opções chegam depois do campo: escolher antes de elas existirem não seleciona nada.
    await waitFor(() => expect(escolha.querySelector(`option[value="${USER}"]`)).not.toBeNull());
    fireEvent.change(escolha, { target: { value: USER } });
    const vincular = await screen.findByRole('button', { name: 'Vincular usuário' });
    await waitFor(() => expect(vincular).toBeEnabled());
    fireEvent.click(vincular);
    expect(await screen.findByText('Este usuário não pode ser vinculado a este motorista. Escolha outro.')).toBeInTheDocument();
  });

  it('usuário desativado aparece como inativo; desvincular exige justificativa e funciona com o motorista inativo', async () => {
    const service = fakeService({ getDriver: vi.fn(async () => ({ kind: 'success', value: detail({ status: 'inactive' }, { id: USER, displayName: 'Condutor Um', active: false }) })) });
    renderDetail(service);
    expect(await screen.findByText(/\(usuário inativo\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Usuário vinculável')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desvincular usuário' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desvincular usuário' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar desvinculação' }));
    expect(await within(dialog).findByText(/Explique o motivo com pelo menos 5 caracteres/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Justificativa'), { target: { value: 'Usuário saiu da empresa' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar desvinculação' }));
    await waitFor(() => expect(service.unlinkDriverUser).toHaveBeenCalledWith(ORG, DRIVER, 'Usuário saiu da empresa'));
  });

  it('motorista inativo não oferece vincular nem editar; não encontrado e sem serviço têm estado próprio', async () => {
    const first = renderDetail(fakeService({ getDriver: vi.fn(async () => ({ kind: 'success', value: detail({ status: 'inactive' }) })) }));
    await screen.findByRole('heading', { level: 2, name: 'Carlos Motorista' });
    expect(screen.queryByLabelText('Usuário vinculável')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar motorista' })).not.toBeInTheDocument();
    first.unmount();
    const second = renderDetail(fakeService({ getDriver: vi.fn(async () => ({ kind: 'not_found' })) }));
    expect(await screen.findByText('Motorista não encontrado')).toBeInTheDocument();
    second.unmount();
    renderDetail(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });

  it('motorista anonimizado não mostra documentos nem revelar', async () => {
    renderDetail(fakeService({ getDriver: vi.fn(async () => ({ kind: 'success', value: detail({ status: 'inactive', anonymizedAt: '2026-10-07T15:00:00Z', fullName: 'Motorista anonimizado', phone: null }) })) }));
    expect(await screen.findByText(/Dados pessoais anonimizados em 07\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revelar CPF' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Anonimizado').length).toBeGreaterThan(0);
  });
});
