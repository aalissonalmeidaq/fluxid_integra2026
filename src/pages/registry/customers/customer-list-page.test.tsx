import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { CustomerListItem } from '@/application/registry/registry-views';
import { CustomerListView } from './customer-list-page';

const ORG = '20000000-0000-4000-8000-00000000000a';

const item = (n: number, over: Partial<CustomerListItem> = {}): CustomerListItem => ({
  id: `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`, personType: 'legal', documentDisplay: '11222333000181', legalName: `Cliente ${n}`, tradeName: null,
  segment: 'hospital', status: 'active', cities: ['São Paulo'], siteCount: 1, anonymizedAt: null, ...over,
});

function fakeService(pages: Array<{ items: CustomerListItem[]; total: number; next: string | null }> | Record<string, unknown>) {
  const listCustomers = vi.fn();
  if (Array.isArray(pages)) pages.forEach((page) => listCustomers.mockResolvedValueOnce({ kind: 'success', value: page }));
  else listCustomers.mockResolvedValue(pages);
  return { listCustomers } as unknown as RegistryService & { listCustomers: ReturnType<typeof vi.fn> };
}

const renderList = (service: ReturnType<typeof fakeService> | null, canCreate = true) => render(<CustomerListView organizationId={ORG} service={service} canCreate={canCreate} />);

describe('lista de clientes (história 2)', () => {
  it('mostra o total em região de status, os clientes e o CNPJ completo', async () => {
    renderList(fakeService([{ items: [item(1), item(2)], total: 2, next: null }]));
    expect(await screen.findByText('2 clientes encontrados')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('link', { name: 'Cliente 1' })).toHaveAttribute('href', expect.stringMatching(/^\/clientes\/81000000/));
    expect(screen.getAllByText('11.222.333/0001-81').length).toBe(2);
  });

  it('CPF aparece mascarado e a situação sempre com texto', async () => {
    renderList(fakeService([{ items: [item(1, { personType: 'individual', documentDisplay: '***.***.***-25', legalName: 'Ana Lima', status: 'inactive', anonymizedAt: '2026-10-01T10:00:00Z' })], total: 1, next: null }]));
    expect(await screen.findByText('***.***.***-25')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(/Inativo/)).toBeInTheDocument();
    expect(within(table).getByText('Anonimizado')).toBeInTheDocument();
  });

  it('o total usa o singular quando há um só', async () => {
    renderList(fakeService([{ items: [item(1)], total: 1, next: null }]));
    expect(await screen.findByText('1 cliente encontrado')).toHaveAttribute('role', 'status');
  });

  it('busca e filtros chamam o serviço com os valores e voltam à primeira página', async () => {
    const service = fakeService({ kind: 'success', value: { items: [], total: 0, next: null } });
    service.listCustomers.mockResolvedValue({ kind: 'success', value: { items: [item(1)], total: 1, next: null } });
    renderList(service);
    await screen.findByRole('link', { name: 'Cliente 1' });
    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: '  Alfa ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(service.listCustomers).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ search: '  Alfa ', status: 'active', limit: 25, cursor: null })));
    fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'clinic' } });
    fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'SP' } });
    fireEvent.change(screen.getByLabelText('Geocerca'), { target: { value: 'yes' } });
    fireEvent.change(screen.getByLabelText('Situação cadastral'), { target: { value: 'all' } });
    await waitFor(() => expect(service.listCustomers).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ segment: 'clinic', state: 'SP', hasGeofence: true, status: 'all', cursor: null })));
  });

  it('"Mostrar mais" busca a próxima página mantendo filtros e acrescenta os itens', async () => {
    const service = fakeService([
      { items: [item(1)], total: 2, next: 'cursor-2' },
      { items: [item(2)], total: 2, next: null },
    ]);
    renderList(service);
    await screen.findByRole('link', { name: 'Cliente 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais clientes' }));
    expect(await screen.findByRole('link', { name: 'Cliente 2' })).toBeInTheDocument();
    expect(service.listCustomers).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ cursor: 'cursor-2', status: 'active' }));
    expect(screen.getByRole('link', { name: 'Cliente 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar mais clientes' })).not.toBeInTheDocument();
  });

  it('estado vazio sem filtros: orienta e oferece o cadastro só a quem pode cadastrar', async () => {
    renderList(fakeService([{ items: [], total: 0, next: null }]));
    expect(await screen.findByText('Nenhum cliente encontrado')).toBeInTheDocument();
    expect(screen.getByText('Esta organização ainda não tem clientes ativos.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Cadastrar cliente' }).length).toBeGreaterThan(0);
  });

  it('estado vazio sem permissão de cadastro não oferece a ação', async () => {
    renderList(fakeService([{ items: [], total: 0, next: null }]), false);
    expect(await screen.findByText('Nenhum cliente encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cadastrar cliente' })).not.toBeInTheDocument();
  });

  it('estado vazio com filtro orienta a ajustar a busca', async () => {
    const service = fakeService({ kind: 'success', value: { items: [], total: 0, next: null } });
    service.listCustomers.mockResolvedValue({ kind: 'success', value: { items: [], total: 0, next: null } });
    renderList(service);
    await screen.findByText('Nenhum cliente encontrado');
    fireEvent.change(screen.getByLabelText('Segmento'), { target: { value: 'clinic' } });
    expect(await screen.findByText(/Nenhum cliente corresponde à busca e aos filtros/)).toBeInTheDocument();
  });

  it('erro de serviço mostra o estado de erro com nova tentativa', async () => {
    const service = fakeService({ kind: 'unavailable' });
    renderList(service);
    expect(await screen.findByText('Não foi possível carregar clientes')).toBeInTheDocument();
    service.listCustomers.mockResolvedValue({ kind: 'success', value: { items: [item(1)], total: 1, next: null } });
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByRole('link', { name: 'Cliente 1' })).toBeInTheDocument();
  });

  it('sem conexão e sem permissão mostram o estado próprio', async () => {
    const { unmount } = renderList(fakeService({ kind: 'offline' }));
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
    unmount();
    renderList(fakeService({ kind: 'access_denied' }));
    expect(await screen.findByText('Acesso negado')).toBeInTheDocument();
  });

  it('sem serviço mostra "Conexão indisponível"', () => {
    renderList(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });

  it('a tabela tem legenda e cabeçalhos associados', async () => {
    renderList(fakeService([{ items: [item(1)], total: 1, next: null }]));
    const table = await screen.findByRole('table', { name: 'Clientes da organização' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Cliente', 'Documento', 'Segmento', 'Cidades', 'Situação']);
  });
});
