import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { CustomerDetail } from '@/application/registry/registry-views';
import { CustomerFormView } from './customer-form-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-0000000000a1';
const OTHER = '81000000-0000-4000-8000-0000000000b2';
// Documentos fictícios, gerados para a suíte (nunca reais).
const CNPJ = '11222333000181';
const CPF = '52998224725';

const detail = (over: Partial<CustomerDetail['customer']> = {}): CustomerDetail => ({
  customer: {
    id: CUSTOMER, personType: 'legal', documentDisplay: '11.222.333/0001-81', legalName: 'Hospital Teste', tradeName: 'Hosp', segment: 'hospital', status: 'active',
    anonymizedAt: null, segmentDetail: null, notes: null, version: 3, createdAt: '2026-10-07T10:00:00Z', ...over,
  },
  contacts: [{ id: 'c1', name: 'Ana Teste', role: 'Compras', phone: '11987654321', email: 'ana@example.invalid', isPrimary: true, anonymizedAt: null }],
  sites: [],
});

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    createCustomer: vi.fn(async () => ({ kind: 'success' as const, value: { id: CUSTOMER, version: 1 } })),
    updateCustomer: vi.fn(async () => ({ kind: 'success' as const, value: { version: 4 } })),
    getCustomer: vi.fn(async () => ({ kind: 'success' as const, value: detail() })),
    ...overrides,
  } as unknown as RegistryService & Record<'createCustomer' | 'updateCustomer' | 'getCustomer', ReturnType<typeof vi.fn>>;
}

const renderForm = (service: ReturnType<typeof fakeService> | null, extra: Record<string, unknown> = {}) => {
  const onNavigate = vi.fn();
  render(<CustomerFormView organizationId={ORG} service={service} online onNavigate={onNavigate} {...extra} />);
  return { onNavigate };
};

const fillLegal = (): void => {
  fireEvent.change(screen.getByLabelText('Tipo de pessoa'), { target: { value: 'legal' } });
  fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '11.222.333/0001-81' } });
  fireEvent.change(screen.getByLabelText('Razão social'), { target: { value: ' Hospital Teste ' } });
  fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'hospital' } });
};

describe('cadastro de cliente (história 1)', () => {
  it('mostra as seções na mesma página, com um único envio e rótulos visíveis', () => {
    renderForm(fakeService());
    expect(screen.getByRole('heading', { name: 'Cadastrar cliente' })).toBeInTheDocument();
    expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual(['Identificação', 'Segmento', 'Contatos', 'Observações']);
    expect(screen.getAllByRole('button', { name: 'Cadastrar cliente' })).toHaveLength(1);
  });

  it('o rótulo do documento segue o tipo de pessoa', () => {
    renderForm(fakeService());
    fireEvent.change(screen.getByLabelText('Tipo de pessoa'), { target: { value: 'individual' } });
    expect(screen.getByLabelText('CPF')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
  });

  it('campos vazios: erros junto dos campos e foco no primeiro erro, sem enviar', async () => {
    const service = fakeService();
    renderForm(service);
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    expect(await screen.findByText('Escolha pessoa jurídica ou pessoa física.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de pessoa')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText('Tipo de pessoa')).toHaveFocus());
    expect(service.createCustomer).not.toHaveBeenCalled();
  });

  it('CNPJ com dígito errado é recusado antes do envio', () => {
    const service = fakeService();
    renderForm(service);
    fillLegal();
    fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '11.222.333/0001-82' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    expect(screen.getByText('Informe um CNPJ válido.')).toBeInTheDocument();
    expect(service.createCustomer).not.toHaveBeenCalled();
  });

  it('envia uma única vez com os valores normalizados e abre o detalhe do cliente criado', async () => {
    const service = fakeService();
    const { onNavigate } = renderForm(service);
    fillLegal();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    await waitFor(() => expect(service.createCustomer).toHaveBeenCalledTimes(1));
    expect(service.createCustomer).toHaveBeenCalledWith(ORG, expect.objectContaining({ personType: 'legal', document: CNPJ, legalName: 'Hospital Teste', segment: 'hospital' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/clientes/${CUSTOMER}`));
  });

  it('pessoa física envia o CPF só com dígitos', async () => {
    const service = fakeService();
    renderForm(service);
    fireEvent.change(screen.getByLabelText('Tipo de pessoa'), { target: { value: 'individual' } });
    fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '529.982.247-25' } });
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Pessoa Teste' } });
    fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText('Qual segmento?'), { target: { value: 'Consultório' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    await waitFor(() => expect(service.createCustomer).toHaveBeenCalledTimes(1));
    expect(service.createCustomer).toHaveBeenCalledWith(ORG, expect.objectContaining({ personType: 'individual', document: CPF, segmentDetail: 'Consultório' }));
  });

  it('conflito de documento: mensagem indica o cliente existente, sem mostrar o documento, e leva ao cadastro dele', async () => {
    const service = fakeService({ createCustomer: vi.fn(async () => ({ kind: 'document_conflict', owner: { id: OTHER, label: 'Clínica Existente' } })) });
    renderForm(service);
    fillLegal();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    expect(await screen.findByText('Este documento já está cadastrado em Clínica Existente.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir o cliente que usa este documento' })).toHaveAttribute('href', `/clientes/${OTHER}`);
    expect(document.body.textContent).not.toContain(CNPJ);
  });

  it('erros do servidor por campo aparecem junto do campo', async () => {
    const service = fakeService({ createCustomer: vi.fn(async () => ({ kind: 'invalid', fields: { legal_name: 'Nome inválido.' } })) });
    renderForm(service);
    fillLegal();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    expect(await screen.findByText('Nome inválido.')).toBeInTheDocument();
  });

  it('falha de conexão no meio do envio mostra "resultado desconhecido" e permite repetir', async () => {
    const createCustomer = vi.fn().mockResolvedValueOnce({ kind: 'unknown' }).mockResolvedValueOnce({ kind: 'success', value: { id: CUSTOMER, version: 1 } });
    const { onNavigate } = renderForm(fakeService({ createCustomer }));
    fillLegal();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    expect(await screen.findByText('Resultado desconhecido')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/clientes/${CUSTOMER}`));
    expect(createCustomer).toHaveBeenCalledTimes(2);
  });

  it('sem conexão a escrita fica desabilitada com o motivo', () => {
    renderForm(fakeService(), { online: false });
    expect(screen.getByRole('button', { name: 'Cadastrar cliente' })).toBeDisabled();
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();
  });

  it('sem serviço mostra o estado de conexão indisponível, sem formulário', () => {
    renderForm(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cadastrar cliente' })).not.toBeInTheDocument();
  });
});

describe('edição de cliente', () => {
  it('abre com os dados, tipo de pessoa fixo e documento mascarado; sem digitar o documento nada dele é enviado', async () => {
    const service = fakeService();
    const { onNavigate } = renderForm(service, { customerId: CUSTOMER });
    expect(await screen.findByRole('heading', { name: 'Editar cliente' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo de pessoa')).toBeDisabled();
    expect(screen.getByLabelText('CNPJ')).toHaveValue('');
    expect(screen.getByLabelText('CNPJ')).toHaveAttribute('placeholder', '11.222.333/0001-81');
    fireEvent.change(screen.getByLabelText('Razão social'), { target: { value: 'Hospital Novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateCustomer).toHaveBeenCalledTimes(1));
    expect(service.updateCustomer).toHaveBeenCalledWith(ORG, CUSTOMER, 3, expect.objectContaining({ legalName: 'Hospital Novo', document: null, justification: null }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith(`/clientes/${CUSTOMER}`));
  });

  it('documento novo exige justificativa', async () => {
    const service = fakeService();
    renderForm(service, { customerId: CUSTOMER });
    await screen.findByRole('heading', { name: 'Editar cliente' });
    fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '45.997.418/0001-53' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Explique a correção do documento em 5 a 500 caracteres.')).toBeInTheDocument();
    expect(service.updateCustomer).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Justificativa da correção do documento'), { target: { value: 'Digitado errado no cadastro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(service.updateCustomer).toHaveBeenCalledTimes(1));
    expect(service.updateCustomer).toHaveBeenCalledWith(ORG, CUSTOMER, 3, expect.objectContaining({ document: '45997418000153', justification: 'Digitado errado no cadastro' }));
  });

  it('conflito de versão pede para recarregar', async () => {
    const service = fakeService({ updateCustomer: vi.fn(async () => ({ kind: 'version_conflict' })) });
    renderForm(service, { customerId: CUSTOMER });
    await screen.findByRole('heading', { name: 'Editar cliente' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Cliente alterado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar dados' }));
    await waitFor(() => expect(service.getCustomer).toHaveBeenCalledTimes(2));
  });

  it('cliente inativo não abre o formulário', async () => {
    const service = fakeService({ getCustomer: vi.fn(async () => ({ kind: 'success', value: detail({ status: 'inactive' }) })) });
    renderForm(service, { customerId: CUSTOMER });
    expect(await screen.findByText(/está inativo e não pode ser editado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument();
  });

  it('cliente inexistente ou de outra organização mostra "não encontrado"', async () => {
    renderForm(fakeService({ getCustomer: vi.fn(async () => ({ kind: 'not_found' })) }), { customerId: CUSTOMER });
    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
  });
});
