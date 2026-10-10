import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderDetail, CylinderTypeView } from '@/application/cylinders/cylinder-views';
import { CylinderFormView } from './cylinder-form-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = '72000000-0000-4000-8000-0000000000a1';
const OTHER = '72000000-0000-4000-8000-0000000000b2';
const TYPE: CylinderTypeView = { id: '71000000-0000-4000-8000-0000000000a1', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', classification: 'medicinal', active: true };

const detail = (over: Partial<CylinderDetail['cylinder']> = {}): CylinderDetail => ({
  cylinder: {
    id: CYL, serialNumber: 'AB-1', type: TYPE, manufacturer: 'Fábrica X', manufactureYear: 2020, workingPressureBar: 200, notes: 'obs',
    status: 'active', inactivationReason: null, stockStatus: 'out_of_stock', custodyStatus: 'in_organization', custodySite: null, hydroLastResult: null, hydroNextDueOn: null, version: 3, createdAt: '2026-10-05T10:00:00Z', ...over,
  },
  identifiers: [], tests: [], hydroStatus: 'sem_teste',
});

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    catalog: vi.fn(async () => ({ kind: 'success' as const, value: [TYPE] })),
    get: vi.fn(async () => ({ kind: 'success' as const, value: detail() })),
    create: vi.fn(async () => ({ kind: 'success' as const, value: { cylinderId: CYL, version: 1 } })),
    update: vi.fn(async () => ({ kind: 'success' as const, value: { version: 4 } })),
    saveType: vi.fn(async () => ({ kind: 'success' as const, value: { typeId: 't2' } })),
    ...overrides,
  } as unknown as CylinderService & Record<'catalog' | 'get' | 'create' | 'update' | 'saveType', ReturnType<typeof vi.fn>>;
}

const renderCreate = (service: ReturnType<typeof fakeService> | null, extra: Record<string, unknown> = {}) => {
  const onNavigate = vi.fn();
  render(<CylinderFormView organizationId={ORG} service={service} online onNavigate={onNavigate} {...extra} />);
  return { onNavigate };
};

const fillValid = async () => {
  await screen.findByRole('option', { name: /Oxigênio/ });
  fireEvent.change(screen.getByLabelText('Tipo de cilindro'), { target: { value: TYPE.id } });
  fireEvent.change(screen.getByLabelText('Número de série'), { target: { value: ' AB-1 ' } });
  fireEvent.change(screen.getByLabelText('Tipo do identificador'), { target: { value: 'qr_code' } });
  fireEvent.change(screen.getByLabelText('Valor do identificador'), { target: { value: ' QR-1\n' } });
};

describe('cadastro de cilindro (história 1)', () => {
  it('mostra as seções na mesma página, com um único envio e rótulos visíveis', async () => {
    renderCreate(fakeService());
    expect(await screen.findByRole('heading', { name: 'Cadastrar cilindro' })).toBeInTheDocument();
    expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual(['Identificação', 'Fabricação', 'Primeiro identificador']);
    expect(screen.getAllByRole('button', { name: 'Cadastrar cilindro' })).toHaveLength(1);
    for (const label of ['Tipo de cilindro', 'Número de série', 'Fabricante', 'Ano de fabricação', 'Pressão de trabalho (bar)', 'Observações', 'Tipo do identificador', 'Valor do identificador']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('campos obrigatórios vazios: cada erro aparece junto do campo, em texto, e o foco vai ao primeiro erro (RF-030)', async () => {
    const service = fakeService();
    renderCreate(service);
    await screen.findByRole('option', { name: /Oxigênio/ });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    expect(await screen.findByText('Escolha o tipo de cilindro.')).toBeInTheDocument();
    expect(screen.getByText('Informe o número de série gravado no casco.')).toBeInTheDocument();
    expect(screen.getByText('Informe o valor do identificador.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de cilindro')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText('Tipo de cilindro')).toHaveFocus());
    expect(service.create).not.toHaveBeenCalled();
  });

  it('envia os valores normalizados e abre o detalhe do cilindro criado', async () => {
    const service = fakeService();
    const { onNavigate } = renderCreate(service);
    await fillValid();
    fireEvent.change(screen.getByLabelText('Ano de fabricação'), { target: { value: '2020' } });
    fireEvent.change(screen.getByLabelText('Pressão de trabalho (bar)'), { target: { value: '200,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
    expect(service.create).toHaveBeenCalledWith(ORG, {
      cylinderTypeId: TYPE.id, serialNumber: 'AB-1', manufacturer: null, manufactureYear: 2020, workingPressureBar: 200.5, notes: null,
      identifier: { kind: 'qr_code', value: 'QR-1' },
    });
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/cilindros/${CYL}`));
  });

  it('número de série repetido: erro no campo e link para o cilindro que o usa', async () => {
    const service = fakeService({ create: vi.fn(async () => ({ kind: 'serial_conflict', ownerCylinderId: OTHER })) });
    renderCreate(service);
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    expect(await screen.findByText('Este número de série já está cadastrado nesta organização.')).toBeInTheDocument();
    expect(screen.getByLabelText('Número de série')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('link', { name: /abrir o cilindro que usa este número de série/i })).toHaveAttribute('href', `/cilindros/${OTHER}`);
    await waitFor(() => expect(screen.getByLabelText('Número de série')).toHaveFocus());
  });

  it('identificador já usado: erro no campo do identificador e link para o dono', async () => {
    const service = fakeService({ create: vi.fn(async () => ({ kind: 'identifier_conflict', ownerCylinderId: OTHER })) });
    renderCreate(service);
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    expect(await screen.findByText('Este identificador já está vinculado a outro cilindro.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir o cilindro que usa este identificador/i })).toHaveAttribute('href', `/cilindros/${OTHER}`);
  });

  it('identificador que já existiu e foi desativado só pode voltar por transferência', async () => {
    const service = fakeService({ create: vi.fn(async () => ({ kind: 'identifier_unavailable' })) });
    renderCreate(service);
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    expect(await screen.findByText(/foi usado e desativado/i)).toBeInTheDocument();
  });

  it('erros de validação do servidor aparecem junto dos campos', async () => {
    const service = fakeService({ create: vi.fn(async () => ({ kind: 'invalid', fields: { manufacture_year: 'Informe o ano de 1900 até o ano atual.' } })) });
    renderCreate(service);
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    expect(await screen.findByText('Informe o ano de 1900 até o ano atual.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ano de fabricação')).toHaveAttribute('aria-invalid', 'true');
  });

  it('um único envio por vez: o botão fica ocupado e ignora o segundo clique', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const service = fakeService({ create: vi.fn(() => new Promise((done) => { resolve = done; })) });
    renderCreate(service);
    await fillValid();
    const button = screen.getByRole('button', { name: 'Cadastrar cilindro' });
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: /cadastrando/i }));
    expect(service.create).toHaveBeenCalledTimes(1);
    resolve({ kind: 'success', value: { cylinderId: CYL, version: 1 } });
  });

  it('resultado desconhecido: avisa e, ao repetir e receber conflito do próprio cilindro, indica que o cadastro anterior concluiu', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce({ kind: 'unknown' })
      .mockResolvedValueOnce({ kind: 'serial_conflict', ownerCylinderId: CYL });
    renderCreate(fakeService({ create }));
    await fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível confirmar/i);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cilindro' }));
    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent(/cadastro anterior parece ter sido concluído/i);
    expect(screen.getByRole('link', { name: /abrir o cilindro/i })).toHaveAttribute('href', `/cilindros/${CYL}`);
  });

  it('sem conexão: o envio fica desabilitado com o motivo e nada é enviado nem guardado (RF-035)', async () => {
    const service = fakeService();
    render(<CylinderFormView organizationId={ORG} service={service} online={false} onNavigate={vi.fn()} />);
    await screen.findByRole('option', { name: /Oxigênio/ }).catch(() => undefined);
    expect(screen.getByText(/exige conexão/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cadastrar cilindro' })).toBeDisabled();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('sem serviço (conexão indisponível) mostra erro e não tenta operar', async () => {
    renderCreate(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });

  it('falha ao carregar o catálogo: erro com nova tentativa', async () => {
    const catalog = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'success', value: [TYPE] });
    renderCreate(fakeService({ catalog }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível carregar os tipos/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByRole('option', { name: /Oxigênio/ })).toBeInTheDocument();
  });

  it('cria um tipo novo em linha e o seleciona', async () => {
    const created: CylinderTypeView = { id: 't2', gas: 'Hélio', capacityValue: 7, capacityUnit: 'm3', classification: 'industrial', active: true };
    const catalog = vi.fn().mockResolvedValueOnce({ kind: 'success', value: [TYPE] }).mockResolvedValue({ kind: 'success', value: [TYPE, created] });
    const service = fakeService({ catalog });
    renderCreate(service);
    await screen.findByRole('option', { name: /Oxigênio/ });
    fireEvent.click(screen.getByRole('button', { name: 'Novo tipo' }));
    fireEvent.change(screen.getByLabelText('Gás'), { target: { value: 'Hélio' } });
    fireEvent.change(screen.getByLabelText('Capacidade'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Unidade'), { target: { value: 'm3' } });
    fireEvent.change(screen.getByLabelText('Classificação'), { target: { value: 'industrial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tipo' }));
    await waitFor(() => expect(service.saveType).toHaveBeenCalledWith(ORG, { gas: 'Hélio', capacityValue: 7, capacityUnit: 'm3', classification: 'industrial' }));
    await waitFor(() => expect((screen.getByLabelText('Tipo de cilindro') as HTMLSelectElement).value).toBe('t2'));
  });
});

describe('edição de cilindro (RF-004)', () => {
  const renderEdit = (service: ReturnType<typeof fakeService>, extra: Record<string, unknown> = {}) => {
    const onNavigate = vi.fn();
    render(<CylinderFormView organizationId={ORG} service={service} online cylinderId={CYL} onNavigate={onNavigate} {...extra} />);
    return { onNavigate };
  };

  it('carrega os dados atuais, não pede identificador e envia a versão esperada', async () => {
    const service = fakeService();
    const { onNavigate } = renderEdit(service);
    expect(await screen.findByRole('heading', { name: 'Editar cilindro' })).toBeInTheDocument();
    expect((screen.getByLabelText('Número de série') as HTMLInputElement).value).toBe('AB-1');
    expect(screen.queryByLabelText('Valor do identificador')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fabricante'), { target: { value: 'Fábrica Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.update).toHaveBeenCalledTimes(1));
    expect(service.update).toHaveBeenCalledWith(ORG, expect.objectContaining({ cylinderId: CYL, expectedVersion: 3, manufacturer: 'Fábrica Y', serialNumber: 'AB-1' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/cilindros/${CYL}`));
  });

  it('versão antiga: avisa, orienta a recarregar e preserva o que a pessoa digitou para comparação', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ kind: 'success', value: detail() })
      .mockResolvedValueOnce({ kind: 'success', value: detail({ manufacturer: 'Feito por outra pessoa', version: 4 }) });
    const service = fakeService({ get, update: vi.fn(async () => ({ kind: 'version_conflict' })) });
    renderEdit(service);
    await screen.findByRole('heading', { name: 'Editar cilindro' });
    fireEvent.change(screen.getByLabelText('Fabricante'), { target: { value: 'Minha edição' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/foi alterado por outra pessoa/i);
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar dados' }));
    await waitFor(() => expect((screen.getByLabelText('Fabricante') as HTMLInputElement).value).toBe('Feito por outra pessoa'));
    expect(screen.getByText(/Minha edição/)).toBeInTheDocument();
  });

  it('cilindro inativo não é editado: avisa, não mostra o formulário e oferece reativar só a quem pode', async () => {
    const inactive = detail({ status: 'inactive', inactivationReason: 'lost' });
    renderEdit(fakeService({ get: vi.fn(async () => ({ kind: 'success', value: inactive })) }), { canReactivate: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(/está inativo e não pode ser editado/i);
    expect(screen.queryByLabelText('Número de série')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reativar/i })).toHaveAttribute('href', `/cilindros/${CYL}`);
  });

  it('sem permissão para reativar, o aviso não oferece a ação', async () => {
    const inactive = detail({ status: 'inactive', inactivationReason: 'lost' });
    renderEdit(fakeService({ get: vi.fn(async () => ({ kind: 'success', value: inactive })) }), { canReactivate: false });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /reativar/i })).not.toBeInTheDocument();
  });

  it('cilindro inexistente ou de outra organização: "não encontrado"', async () => {
    renderEdit(fakeService({ get: vi.fn(async () => ({ kind: 'not_found' })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cilindro não encontrado/i);
  });
});
