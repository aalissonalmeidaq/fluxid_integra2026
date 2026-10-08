import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryService } from '@/application/registry/registry-service';
import type { RegistryEventView } from '@/application/registry/registry-views';
import { RegistryHistory } from './registry-history';

const ORG = '20000000-0000-4000-8000-00000000000a';
const ENTITY = '85000000-0000-4000-8000-0000000000a1';

const event = (sequence: number, eventType: string, over: Partial<RegistryEventView> = {}): RegistryEventView => ({
  id: `87000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`, sequence, eventType, actorName: 'Administrador A', occurredAt: '2026-10-07T15:30:00.000Z', justification: null, data: {}, ...over,
});

function fakeService(pages: Array<{ events: RegistryEventView[]; next: string | null }> | Record<string, unknown>) {
  const history = vi.fn();
  if (Array.isArray(pages)) pages.forEach((page) => history.mockResolvedValueOnce({ kind: 'success', value: page }));
  else history.mockResolvedValue(pages);
  return { history } as unknown as RegistryService & { history: ReturnType<typeof vi.fn> };
}
// Só os itens do histórico (a lista ordenada); as listas internas de detalhes também têm itens.
const eventItems = (): HTMLElement[] => screen.getAllByRole('listitem').filter((item) => item.parentElement?.tagName === 'OL');
const renderHistory = (service: ReturnType<typeof fakeService> | null, entityType: 'vehicle' | 'driver' | 'customer' = 'vehicle') =>
  render(<RegistryHistory organizationId={ORG} service={service} entityType={entityType} entityId={ENTITY} />);

describe('histórico dos cadastros (história 7)', () => {
  it('lista os eventos com tipo, data, pessoa e anuncia o total', async () => {
    renderHistory(fakeService([{ events: [event(2, 'vehicle_status_changed', { data: { from: 'available', to: 'maintenance' } }), event(1, 'vehicle_created')], next: null }]));
    expect(await screen.findByText('2 eventos exibidos')).toHaveAttribute('role', 'status');
    const items = eventItems();
    expect(items[0]).toHaveTextContent('Situação do veículo alterada');
    expect(items[0]).toHaveTextContent('Administrador A');
    expect(items[0]).toHaveTextContent('Situação: Disponível → Em manutenção');
    expect(items[1]).toHaveTextContent('Veículo cadastrado');
  });

  it('edição mostra campos não sensíveis com valores e, para os pessoais, só "alterado"', async () => {
    renderHistory(fakeService([{ events: [event(2, 'driver_updated', { data: { changes: [{ field: 'cnh_category', old: 'B', new: 'C' }], changed_sensitive: ['full_name', 'phone'] } })], next: null }]), 'driver');
    await screen.findByText('1 evento exibido');
    const item = eventItems()[0] as HTMLElement;
    expect(item).toHaveTextContent('Categoria da CNH: B → C');
    expect(item).toHaveTextContent('Campos pessoais alterados (valores não exibidos): Nome, Telefone');
  });

  it('mostra a justificativa e a placa antiga e nova', async () => {
    renderHistory(fakeService([{ events: [event(3, 'vehicle_updated', { justification: 'Placa digitada errada', data: { changes: [{ field: 'plate', old: 'ABC1234', new: 'ZZZ9999' }] } })], next: null }]));
    await screen.findByText('1 evento exibido');
    const item = eventItems()[0] as HTMLElement;
    expect(item).toHaveTextContent('Justificativa: Placa digitada errada');
    expect(item).toHaveTextContent('Placa: ABC1234 → ZZZ9999');
  });

  it('filtros por tipo e período chamam o serviço desde a primeira página; o filtro só tem tipos da área', async () => {
    const service = fakeService({ kind: 'success', value: { events: [event(1, 'vehicle_created')], next: null } });
    renderHistory(service);
    await screen.findByText('1 evento exibido');
    const select = screen.getByLabelText('Tipo de evento');
    expect(within(select).queryByRole('option', { name: 'Cliente cadastrado' })).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'vehicle_status_changed' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-31' } });
    fireEvent.change(screen.getByLabelText('Ordem'), { target: { value: 'asc' } });
    await waitFor(() => expect(service.history).toHaveBeenLastCalledWith(ORG, 'vehicle', ENTITY, expect.objectContaining({ eventType: 'vehicle_status_changed', from: '2026-10-01', to: '2026-10-31', order: 'asc', cursor: null })));
  });

  it('"Mostrar mais eventos" usa o cursor, mantém a ordem e não repete itens', async () => {
    const service = fakeService([{ events: [event(2, 'vehicle_updated')], next: '2' }, { events: [event(1, 'vehicle_created')], next: null }]);
    renderHistory(service);
    await screen.findByText('1 evento exibido');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar mais eventos' }));
    expect(await screen.findByText('2 eventos exibidos')).toBeInTheDocument();
    expect(service.history).toHaveBeenLastCalledWith(ORG, 'vehicle', ENTITY, expect.objectContaining({ cursor: '2' }));
    expect(eventItems().map((item) => item.textContent ?? '')).toEqual([expect.stringContaining('Veículo alterado'), expect.stringContaining('Veículo cadastrado')]);
    expect(screen.queryByRole('button', { name: 'Mostrar mais eventos' })).not.toBeInTheDocument();
  });

  it('estado vazio, erro com nova tentativa, offline e acesso negado', async () => {
    const empty = renderHistory(fakeService([{ events: [], next: null }]));
    expect(await screen.findByText('Nenhum evento encontrado')).toBeInTheDocument();
    empty.unmount();
    const failing = fakeService({ kind: 'unavailable' });
    const error = renderHistory(failing);
    expect(await screen.findByText('Não foi possível carregar o histórico')).toBeInTheDocument();
    failing.history.mockResolvedValue({ kind: 'success', value: { events: [event(1, 'vehicle_created')], next: null } });
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByText('1 evento exibido')).toBeInTheDocument();
    error.unmount();
    const offline = renderHistory(fakeService({ kind: 'offline' }));
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
    offline.unmount();
    renderHistory(fakeService({ kind: 'access_denied' }));
    expect(await screen.findByText('Acesso negado')).toBeInTheDocument();
  });

  it('não oferece nenhuma ação de alterar ou apagar o histórico', async () => {
    renderHistory(fakeService([{ events: [event(1, 'vehicle_created')], next: null }]));
    await screen.findByText('1 evento exibido');
    expect(screen.queryByRole('button', { name: /editar|excluir|apagar|remover/i })).not.toBeInTheDocument();
  });

  it('sem serviço mostra "Conexão indisponível"', () => {
    renderHistory(null);
    expect(screen.getByText('Conexão indisponível')).toBeInTheDocument();
  });
});
