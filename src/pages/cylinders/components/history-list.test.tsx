import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CylinderService } from '@/application/cylinders/cylinder-service';
import type { HistoryEvent } from '@/application/cylinders/cylinder-views';
import { HistoryList } from './history-list';

const ORG = '20000000-0000-4000-8000-00000000000a';
const CYL = '72000000-0000-4000-8000-0000000000a1';

const event = (sequence: number, over: Partial<HistoryEvent> = {}): HistoryEvent => ({
  id: `e${sequence}`, sequence, eventType: 'cylinder_updated', actorName: 'Ana Souza', occurredAt: '2026-10-05T13:30:00Z', justification: null, data: {}, referencesEventId: null, ...over,
});

function fakeService(history: ReturnType<typeof vi.fn>) {
  return { history } as unknown as CylinderService & { history: ReturnType<typeof vi.fn> };
}

const page = (events: HistoryEvent[], next: string | null = null) => ({ kind: 'success' as const, value: { events, next } });
const renderList = (service: ReturnType<typeof fakeService> | null) => render(<HistoryList organizationId={ORG} cylinderId={CYL} service={service} />);

describe('histórico de custódia (história 7)', () => {
  it('mostra os eventos do mais recente para o mais antigo, com tipo, data e hora, autor e justificativa', async () => {
    const history = vi.fn(async () => page([
      event(3, { eventType: 'cylinder_inactivated', justification: 'Perdido em campo' }),
      event(2, { eventType: 'stock_in', actorName: 'Bruno Lima' }),
      event(1, { eventType: 'cylinder_created' }),
    ]));
    renderList(fakeService(history));
    expect(screen.getByRole('status')).toHaveTextContent(/carregando/i);
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText('Cilindro inativado')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/Perdido em campo/)).toBeInTheDocument();
    expect(within(items[0]!).getByText('Ana Souza')).toBeInTheDocument();
    expect(within(items[0]!).getByText('05/10/2026 10:30')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Entrada no estoque')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Bruno Lima')).toBeInTheDocument();
    expect(history).toHaveBeenCalledWith(ORG, CYL, expect.objectContaining({ order: 'desc' }));
  });

  it('a ordem pode ser invertida', async () => {
    const history = vi.fn(async () => page([event(1)]));
    renderList(fakeService(history));
    await screen.findAllByRole('listitem');
    fireEvent.change(screen.getByLabelText('Ordem'), { target: { value: 'asc' } });
    await waitFor(() => expect(history).toHaveBeenLastCalledWith(ORG, CYL, expect.objectContaining({ order: 'asc' })));
  });

  it('filtra por tipo de evento e por período', async () => {
    const history = vi.fn(async () => page([event(1)]));
    renderList(fakeService(history));
    await screen.findAllByRole('listitem');
    fireEvent.change(screen.getByLabelText('Tipo de evento'), { target: { value: 'stock_in' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-31' } });
    await waitFor(() => expect(history).toHaveBeenLastCalledWith(ORG, CYL, expect.objectContaining({ eventType: 'stock_in', from: '2026-10-01', to: '2026-10-31' })));
  });

  it('pagina com cursor, mantendo ordem e filtros, e anexa os próximos eventos', async () => {
    const history = vi.fn()
      .mockResolvedValueOnce(page([event(3)], '3'))
      .mockResolvedValueOnce(page([event(2), event(1)], null));
    renderList(fakeService(history));
    await screen.findAllByRole('listitem');
    fireEvent.click(screen.getByRole('button', { name: /mais eventos/i }));
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    expect(history).toHaveBeenLastCalledWith(ORG, CYL, expect.objectContaining({ cursor: '3', order: 'desc' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /mais eventos/i })).not.toBeInTheDocument();
  });

  it('correções referenciam o evento anterior e dizem o que mudou', async () => {
    const history = vi.fn(async () => page([
      event(4, { eventType: 'hydrostatic_test_rectified', referencesEventId: 'e3', justification: 'Data errada' }),
      event(3, { eventType: 'hydrostatic_test_registered' }),
    ]));
    renderList(fakeService(history));
    const items = await screen.findAllByRole('listitem');
    expect(within(items[0]!).getByText(/corrige o evento nº 3/i)).toBeInTheDocument();
  });

  it('descreve os dados do fato em texto, nunca em JSON bruto', async () => {
    const history = vi.fn(async () => page([event(2, { eventType: 'stock_in', data: { hydro_status: 'vencido', identifier_kind: 'qr_code' } })]));
    renderList(fakeService(history));
    const item = (await screen.findAllByRole('listitem'))[0]!;
    expect(within(item).getByText(/teste: vencido/i)).toBeInTheDocument();
    expect(item.textContent).not.toContain('{');
  });

  it('estado vazio, erro com nova tentativa e sem permissão', async () => {
    const { unmount } = renderList(fakeService(vi.fn(async () => page([]))));
    expect(await screen.findByText(/nenhum evento/i)).toBeInTheDocument();
    unmount();
    const history = vi.fn().mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce(page([event(1)]));
    const retry = renderList(fakeService(history));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não foi possível carregar o histórico/i);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(1);
    retry.unmount();
    renderList(fakeService(vi.fn(async () => ({ kind: 'access_denied' }))));
    expect(await screen.findByRole('alert')).toHaveTextContent(/não tem permissão/i);
  });

  it('o histórico é somente leitura: nenhuma ação de alterar ou apagar evento (CA-004)', async () => {
    renderList(fakeService(vi.fn(async () => page([event(1)]))));
    await screen.findAllByRole('listitem');
    expect(screen.queryByRole('button', { name: /editar|alterar|excluir|apagar|remover/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /editar|alterar|excluir|apagar|remover/i })).not.toBeInTheDocument();
  });

  it('sem serviço: conexão indisponível', () => {
    renderList(null);
    expect(screen.getByRole('alert')).toHaveTextContent(/conexão indisponível/i);
  });
});
