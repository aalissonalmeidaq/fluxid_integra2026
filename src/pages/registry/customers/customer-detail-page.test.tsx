import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { CustomerDetail } from '@/application/registry/registry-views';
import { CustomerDetailView, type CustomerAbilities } from './customer-detail-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CUSTOMER = '81000000-0000-4000-8000-0000000000a1';
const SITE = '82000000-0000-4000-8000-0000000000a1';

const ALL: CustomerAbilities = { write: true, deactivate: true, document: true, history: true, anonymize: true };
const READ_ONLY: CustomerAbilities = { write: false, deactivate: false, document: false, history: false, anonymize: false };

const detail = (over: Partial<CustomerDetail['customer']> = {}, sites: CustomerDetail['sites'] = [{ id: SITE, name: 'Matriz', city: 'São Paulo', state: 'SP', status: 'active', activeGeofences: 2, anonymizedName: false }]): CustomerDetail => ({
  customer: {
    id: CUSTOMER, personType: 'legal', documentDisplay: '11222333000181', legalName: 'Hospital Teste', tradeName: 'Hosp', segment: 'hospital', status: 'active', anonymizedAt: null,
    segmentDetail: null, notes: null, version: 3, createdAt: '2026-10-07T15:00:00Z', ...over,
  },
  contacts: [{ id: 'c1', name: 'Ana Teste', role: 'Compras', phone: '11987654321', email: 'ana@example.invalid', isPrimary: true, anonymizedAt: null }],
  sites,
});

const fakeService = (result: unknown) => ({ history: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })), getCustomer: vi.fn(async () => result) }) as unknown as RegistryService & { getCustomer: ReturnType<typeof vi.fn> };
const renderDetail = (service: ReturnType<typeof fakeService> | null, can: CustomerAbilities = ALL) =>
  render(<CustomerDetailView organizationId={ORG} service={service} online customerId={CUSTOMER} can={can} />);

describe('detalhe do cliente (história 2)', () => {
  it('mostra os dados, os contatos e as unidades com a contagem de geocercas ativas', async () => {
    renderDetail(fakeService({ kind: 'success', value: detail() }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Hospital Teste' })).toBeInTheDocument();
    expect(screen.getByText('11.222.333/0001-81')).toBeInTheDocument();
    expect(screen.getByText('Ana Teste (principal)')).toBeInTheDocument();
    expect(screen.getByText('Telefone: 11987654321')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Matriz' })).toHaveAttribute('href', `/clientes/${CUSTOMER}/unidades/${SITE}`);
    expect(screen.getByText(/2 geocercas ativas/)).toBeInTheDocument();
    expect(screen.getAllByText('Situação cadastral:').length).toBeGreaterThanOrEqual(2);
  });

  it('cliente pessoa física mostra o CPF mascarado', async () => {
    renderDetail(fakeService({ kind: 'success', value: detail({ personType: 'individual', documentDisplay: '***.***.***-25', legalName: 'Ana Lima' }) }));
    expect(await screen.findByText('***.***.***-25')).toBeInTheDocument();
    expect(screen.getByText('CPF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revelar CPF' })).toBeInTheDocument();
  });

  it('o CPF só pode ser revelado por quem tem a permissão; o servidor devolve o valor e ele some ao ocultar', async () => {
    const service = { history: vi.fn(async () => ({ kind: 'success', value: { events: [], next: null } })), getCustomer: vi.fn(async () => ({ kind: 'success', value: detail({ personType: 'individual', documentDisplay: '***.***.***-25', legalName: 'Ana Lima' }) })), revealDocument: vi.fn(async () => ({ kind: 'success', value: '52998224725' })) } as unknown as RegistryService & { revealDocument: ReturnType<typeof vi.fn>; getCustomer: ReturnType<typeof vi.fn> };
    const { unmount } = renderDetail(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Revelar CPF' }));
    expect(await screen.findByText('529.982.247-25')).toBeInTheDocument();
    expect(service.revealDocument).toHaveBeenCalledWith(ORG, 'customer', CUSTOMER, 'cpf');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar CPF' }));
    expect(screen.queryByText('529.982.247-25')).not.toBeInTheDocument();
    unmount();
    renderDetail(fakeService({ kind: 'success', value: detail({ personType: 'individual', documentDisplay: '***.***.***-25', legalName: 'Ana Lima' }) }), { ...ALL, document: false });
    await screen.findByText('***.***.***-25');
    expect(screen.queryByRole('button', { name: 'Revelar CPF' })).not.toBeInTheDocument();
  });

  it('contatos sem telefone e e-mail (quem não edita) mostram só nome e função', async () => {
    const value = detail();
    value.contacts = [{ id: 'c1', name: 'Ana Teste', role: 'Compras', phone: null, email: null, isPrimary: false, anonymizedAt: null }];
    renderDetail(fakeService({ kind: 'success', value }), READ_ONLY);
    expect(await screen.findByText('Ana Teste')).toBeInTheDocument();
    expect(screen.queryByText(/Telefone:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/E-mail:/)).not.toBeInTheDocument();
  });

  it('cliente sem unidades oferece acrescentar a primeira, só com permissão', async () => {
    const { unmount } = renderDetail(fakeService({ kind: 'success', value: detail({}, []) }));
    expect(await screen.findByRole('link', { name: 'Acrescentar a primeira unidade' })).toHaveAttribute('href', `/clientes/${CUSTOMER}/unidades/nova`);
    unmount();
    renderDetail(fakeService({ kind: 'success', value: detail({}, []) }), READ_ONLY);
    expect(await screen.findByText('Este cliente ainda não tem unidades.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acrescentar a primeira unidade' })).not.toBeInTheDocument();
  });

  it('"Editar cliente" só com permissão e só se o cadastro está ativo', async () => {
    const { unmount } = renderDetail(fakeService({ kind: 'success', value: detail() }));
    expect(await screen.findByRole('link', { name: 'Editar cliente' })).toHaveAttribute('href', `/clientes/${CUSTOMER}/editar`);
    unmount();
    const second = renderDetail(fakeService({ kind: 'success', value: detail() }), READ_ONLY);
    await screen.findByRole('heading', { level: 2, name: 'Hospital Teste' });
    expect(screen.queryByRole('link', { name: 'Editar cliente' })).not.toBeInTheDocument();
    second.unmount();
    renderDetail(fakeService({ kind: 'success', value: detail({ status: 'inactive' }) }));
    await screen.findByRole('heading', { level: 2, name: 'Hospital Teste' });
    expect(screen.queryByRole('link', { name: 'Editar cliente' })).not.toBeInTheDocument();
  });

  it('cliente anonimizado mostra o aviso e não oferece edição', async () => {
    renderDetail(fakeService({ kind: 'success', value: detail({ status: 'inactive', anonymizedAt: '2026-10-07T15:00:00Z', legalName: 'Cliente anonimizado' }) }));
    expect(await screen.findByText(/Dados pessoais anonimizados em 07\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Editar cliente' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Anonimizado').length).toBeGreaterThan(0);
  });

  it('estados de carregamento, não encontrado, erro e sem serviço', async () => {
    const pending = { getCustomer: vi.fn(() => new Promise(() => undefined)) } as unknown as RegistryService;
    const first = render(<CustomerDetailView organizationId={ORG} service={pending} online customerId={CUSTOMER} can={ALL} />);
    expect(screen.getByText('Carregando o cliente…')).toBeInTheDocument();
    first.unmount();
    const second = renderDetail(fakeService({ kind: 'not_found' }));
    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
    second.unmount();
    const error = fakeService({ kind: 'unavailable' });
    const third = renderDetail(error);
    expect(await screen.findByText('Não foi possível carregar o cliente')).toBeInTheDocument();
    error.getCustomer.mockResolvedValue({ kind: 'success', value: detail() });
    third.unmount();
    renderDetail(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });

  it('as unidades aparecem com a situação em texto', async () => {
    renderDetail(fakeService({ kind: 'success', value: detail({}, [{ id: SITE, name: 'Filial', city: 'Campinas', state: 'SP', status: 'inactive', activeGeofences: 0, anonymizedName: false }]) }));
    const list = (await screen.findByRole('heading', { name: 'Unidades' })).closest('section') as HTMLElement;
    await waitFor(() => expect(within(list).getByText(/Inativo/)).toBeInTheDocument());
    expect(within(list).getByText(/0 geocercas ativas/)).toBeInTheDocument();
  });
});
