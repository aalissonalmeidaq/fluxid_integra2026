import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CylinderService } from '@/application/cylinders/cylinder-service';
import type { CylinderListItem, CylinderTypeView } from '@/application/cylinders/cylinder-views';
import { CylinderListView } from './cylinder-list-page';

const ORG = '20000000-0000-4000-8000-00000000000a';
const OXIGENIO: CylinderTypeView = { id: 't1', gas: 'Oxigênio', capacityValue: 10, capacityUnit: 'l', classification: 'medicinal', active: true };
const NITROGENIO: CylinderTypeView = { id: 't2', gas: 'Nitrogênio', capacityValue: 40, capacityUnit: 'l', classification: 'industrial', active: true };

const item = (n: number, over: Partial<CylinderListItem> = {}): CylinderListItem => ({
  id: `72000000-0000-4000-8000-${String(n).padStart(12, '0')}`, serialNumber: `Q-${String(n).padStart(3, '0')}`, type: OXIGENIO, status: 'active',
  stockStatus: 'out_of_stock', hydroStatus: 'em_dia', activeIdentifierCount: 1, version: 1, ...over,
});

function fakeService(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn(async () => ({ kind: 'success' as const, value: { items: [item(1), item(2, { status: 'inactive', hydroStatus: 'vencido', activeIdentifierCount: 0, stockStatus: 'in_stock' })], total: 2, next: null } })),
    catalog: vi.fn(async () => ({ kind: 'success' as const, value: [OXIGENIO, NITROGENIO] })),
    ...overrides,
  } as unknown as CylinderService & Record<'list' | 'catalog', ReturnType<typeof vi.fn>>;
}

const renderList = (service: ReturnType<typeof fakeService> | null, extra: Record<string, unknown> = {}) =>
  render(<CylinderListView organizationId={ORG} service={service} online canCreate {...extra} />);

describe('lista de cilindros (história 2)', () => {
  it('mostra carregamento e depois a tabela com cabeçalhos e as três situações separadas, com texto', async () => {
    renderList(fakeService());
    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    expect(await screen.findByRole('rowheader', { name: 'Q-001' })).toBeInTheDocument();
    for (const header of ['Número de série', 'Tipo', 'Situação']) expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    const row = screen.getByRole('rowheader', { name: 'Q-002' }).closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText('Inativo')).toBeInTheDocument();
    expect(within(row).getByText('Em estoque')).toBeInTheDocument();
    expect(within(row).getByText('Vencido')).toBeInTheDocument();
    expect(within(row).getByText('Sem identificador')).toBeInTheDocument();
  });

  it('cada número de série é um link para o detalhe', async () => {
    renderList(fakeService());
    expect(await screen.findByRole('link', { name: 'Q-001' })).toHaveAttribute('href', '/cilindros/72000000-0000-4000-8000-000000000001');
  });

  it('o filtro cadastral padrão é "Ativos" e a primeira consulta o usa', async () => {
    const service = fakeService();
    renderList(service);
    await screen.findByRole('rowheader', { name: 'Q-001' });
    expect((screen.getByLabelText('Situação cadastral') as HTMLSelectElement).value).toBe('active');
    expect(service.list).toHaveBeenCalledWith(ORG, expect.objectContaining({ status: 'active' }));
  });

  it('anuncia o total uma vez, em região de status', async () => {
    renderList(fakeService());
    await screen.findByRole('rowheader', { name: 'Q-001' });
    const total = screen.getAllByRole('status').find((node) => /2 cilindros/i.test(node.textContent ?? ''));
    expect(total).toBeDefined();
    expect(screen.getAllByRole('status').filter((node) => /cilindros? encontrados?|2 cilindros/i.test(node.textContent ?? ''))).toHaveLength(1);
  });

  it('busca sem recarregar a página: envia o texto com os filtros', async () => {
    const service = fakeService();
    renderList(service);
    await screen.findByRole('rowheader', { name: 'Q-001' });
    fireEvent.change(screen.getByLabelText('Buscar por identificador ou número de série'), { target: { value: '  QR-1 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ search: 'QR-1', status: 'active' })));
  });

  it('filtros combinados: cadastral, estoque, teste e tipo', async () => {
    const service = fakeService();
    renderList(service);
    await screen.findByRole('rowheader', { name: 'Q-001' });
    fireEvent.change(screen.getByLabelText('Situação cadastral'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Situação de estoque'), { target: { value: 'in_stock' } });
    fireEvent.change(screen.getByLabelText('Situação do teste'), { target: { value: 'a_vencer' } });
    fireEvent.change(screen.getByLabelText('Tipo de cilindro'), { target: { value: 't2' } });
    await waitFor(() => expect(service.list).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ status: 'all', stockStatus: 'in_stock', hydroStatus: 'a_vencer', cylinderTypeId: 't2' })));
  });

  it('paginação por cursor mantém a busca e os filtros', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ kind: 'success', value: { items: [item(1)], total: 2, next: 'cursor-2' } })
      .mockResolvedValueOnce({ kind: 'success', value: { items: [item(1)], total: 2, next: 'cursor-2' } })
      .mockResolvedValueOnce({ kind: 'success', value: { items: [item(2)], total: 2, next: null } });
    renderList(fakeService({ list }));
    await screen.findByRole('rowheader', { name: 'Q-001' });
    fireEvent.change(screen.getByLabelText('Situação de estoque'), { target: { value: 'out_of_stock' } });
    fireEvent.click(await screen.findByRole('button', { name: /mais cilindros/i }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list).toHaveBeenLastCalledWith(ORG, expect.objectContaining({ cursor: 'cursor-2', stockStatus: 'out_of_stock', status: 'active' }));
    expect(await screen.findByRole('rowheader', { name: 'Q-002' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Q-001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mais cilindros/i })).not.toBeInTheDocument();
  });

  it('estado vazio com "Cadastrar cilindro" só para quem pode', async () => {
    const vazio = { list: vi.fn(async () => ({ kind: 'success', value: { items: [], total: 0, next: null } })) };
    const { unmount } = renderList(fakeService(vazio));
    expect(await screen.findByText(/nenhum cilindro/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar cilindro' })).toHaveAttribute('href', '/cilindros/novo');
    unmount();
    renderList(fakeService(vazio), { canCreate: false });
    expect(await screen.findByText(/nenhum cilindro/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cadastrar cilindro' })).not.toBeInTheDocument();
  });

  it('erro de carregamento: alerta com nova tentativa', async () => {
    const list = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'success', value: { items: [item(1)], total: 1, next: null } });
    renderList(fakeService({ list }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível carregar/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findByRole('rowheader', { name: 'Q-001' })).toBeInTheDocument();
  });

  it('acesso negado e sem conexão têm mensagens próprias', async () => {
    const { unmount } = renderList(fakeService({ list: vi.fn(async () => ({ kind: 'access_denied' })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não tem permissão/i);
    unmount();
    renderList(fakeService({ list: vi.fn(async () => ({ kind: 'offline' })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/sem conexão/i);
  });

  it('sem serviço (conexão indisponível) não tenta consultar', async () => {
    renderList(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });

  it('só dados reais: nenhuma marca "Exemplo" (RF-032)', async () => {
    renderList(fakeService());
    await screen.findByRole('rowheader', { name: 'Q-001' });
    expect(screen.queryByText('Exemplo')).not.toBeInTheDocument();
  });

  it('mostra o botão de cadastro no topo só a quem pode cadastrar', async () => {
    renderList(fakeService());
    await screen.findByRole('rowheader', { name: 'Q-001' });
    expect(screen.getByRole('link', { name: 'Cadastrar cilindro' })).toBeInTheDocument();
  });
});
