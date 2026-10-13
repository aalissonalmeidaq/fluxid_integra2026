import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OutboxItem } from '@/infrastructure/synchronization/sync-outbox';
import type { StorageStatus } from '@/infrastructure/local-database/storage-persistence';
import { SyncView } from './sync-page';

// Spec 010, T028 (RF-004, RF-029, RF-030; contracts/telas-e-fluxos.md §2): a tela Sincronização.
const NOW = new Date('2026-10-13T12:00:00Z');
const item = (over: Partial<OutboxItem> = {}): OutboxItem => ({
  id: 'q1', idempotency_key: 'k', organization_id: 'o', actor_id: 'a', device_id: 'd', operation: 'trip.check_item', payload: { trip_id: 'T1', item_id: 'I1' }, version: 1, dependencies: [],
  local_timestamp: '', endpoint_id: 'e', trip_id: 'T1', queued_at: '2026-10-13T11:00:00Z', server_timestamp: null, status: 'pending', attempt_count: 0, failure_reason: null, created_at: '', updated_at: '', ...over,
} as OutboxItem);
const storage = (over: Partial<StorageStatus> = {}): StorageStatus => ({ persistent: true, lowSpace: false, usageBytes: 1, quotaBytes: 100, warning: null, ...over });
const view = (field: { items: OutboxItem[] } | 'error' | null, props: Record<string, unknown> = {}) => render(
  <SyncView online now={() => NOW} readStorage={async () => storage()}
    load={async () => { if (field === 'error') throw new Error('x'); return { items: field?.items ?? [], trips: [] }; }} available={field !== null} {...props} />,
);

describe('tela Sincronização', () => {
  it('carregando: mostra o estado de carregamento', () => {
    view({ items: [] });
    expect(screen.getByText('Carregando a fila…')).toBeInTheDocument();
  });

  it('vazia: "Nada pendente. Tudo foi enviado."', async () => {
    view({ items: [] });
    expect(await screen.findByText('Nada pendente. Tudo foi enviado.')).toBeInTheDocument();
  });

  it('lista por viagem, em texto, com a hora do aparelho e o estado', async () => {
    view({ items: [item(), item({ id: 'q2', operation: 'trip.arrive_stop', payload: { trip_id: 'T1', stop_id: 'S1' } })] });
    const list = await screen.findByRole('list', { name: 'Registros da viagem' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText(/Pendente/).length).toBe(2);
    expect(screen.getByRole('heading', { name: 'Viagem' })).toBeInTheDocument();
  });

  it('destaca o item sem confirmação há mais de 24 horas e mostra o motivo do conflito', async () => {
    view({ items: [item({ queued_at: '2026-10-12T09:00:00Z' }), item({ id: 'q2', status: 'conflict', failure_reason: 'TRIP_CLOSED' })] });
    expect(await screen.findByText('Há mais de 24 horas sem envio')).toBeInTheDocument();
    expect(screen.getByText('A viagem foi encerrada depois que você registrou isto.')).toBeInTheDocument();
  });

  it('erro de leitura da base local', async () => {
    view('error');
    expect(await screen.findByText('Não foi possível ler a fila deste aparelho')).toBeInTheDocument();
  });

  it('sem conexão: avisa que os registros ficam no aparelho', async () => {
    view({ items: [item()] }, { online: false });
    expect(await screen.findByText('Sem conexão. Os registros ficam neste aparelho e serão enviados quando houver conexão.')).toBeInTheDocument();
  });

  it('fila indisponível (sem organização ativa): estado vazio explicativo', async () => {
    view(null);
    expect(await screen.findByText('Nada pendente. Tudo foi enviado.')).toBeInTheDocument();
  });

  it('avisa quando o armazenamento não é persistente ou o espaço está acabando', async () => {
    view({ items: [] }, { readStorage: vi.fn(async () => storage({ persistent: false, warning: 'Este navegador pode apagar os dados do aplicativo se faltar espaço. Instale o aplicativo e envie o que está pendente assim que puder.' })) });
    expect(await screen.findByText(/Este navegador pode apagar os dados/)).toBeInTheDocument();
  });
});

describe('anexos e limites da fila', () => {
  const anexo = (over: Record<string, unknown> = {}) => ({
    id: 'a1', tripId: 'T1', kind: 'photo', position: 1, status: 'pending', sizeBytes: 1000, capturedAt: '2026-10-13T11:00:00Z', outboxItemId: 'q1', deliveryId: null, addedLater: false, failureText: null, ...over,
  });
  const comAnexos = (items: OutboxItem[], attachments: unknown[], props: Record<string, unknown> = {}) => render(
    <SyncView online now={() => NOW} readStorage={async () => storage()} available load={async () => ({ items, trips: [], attachments: attachments as never })} {...props} />,
  );

  it('mostra "2 fotos e assinatura pendentes" na viagem', async () => {
    comAnexos([item()], [anexo(), anexo({ id: 'a2', position: 2 }), anexo({ id: 'a3', kind: 'signature', position: 0 })]);
    expect(await screen.findByText('Anexos: 2 fotos e assinatura pendentes')).toBeInTheDocument();
  });

  it('anexo recusado diz o motivo e pode ser removido do aparelho', async () => {
    const removeAttachment = vi.fn(async () => undefined);
    const actions = { syncing: false, syncNow: vi.fn(async () => undefined), retry: vi.fn(), canDecide: true, discard: vi.fn(), resubmit: vi.fn(), removeAttachment };
    comAnexos([], [anexo({ status: 'failed', failureText: 'O prazo para acrescentar anexos a esta entrega terminou.' })], { actions });
    expect(await screen.findByText(/Foto 1: recusado\./)).toBeInTheDocument();
    expect(screen.getByText(/O prazo para acrescentar anexos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remover foto 1 recusada do aparelho' }));
    await waitFor(() => expect(removeAttachment).toHaveBeenCalledWith('a1'));
  });

  it('acima de 80% do limite de anexos avisa em texto, e no limite diz que novas fotos não são guardadas', async () => {
    const { unmount } = comAnexos([item()], [anexo({ sizeBytes: 43 * 1024 * 1024 })]);
    expect(await screen.findByText('Espaço de fotos quase acabando')).toBeInTheDocument();
    unmount();
    comAnexos([item()], [anexo({ sizeBytes: 51 * 1024 * 1024 })]);
    expect(await screen.findByText('Sem espaço para novas fotos')).toBeInTheDocument();
    expect(screen.getByText(/a entrega é registrada sem elas/)).toBeInTheDocument();
  });

  it('com 80% das 200 operações avisa que a fila está quase cheia, sem recusar nada', async () => {
    const itens = Array.from({ length: 170 }, (_, n) => item({ id: `q${n}` }));
    comAnexos(itens, []);
    expect(await screen.findByText('Fila quase cheia')).toBeInTheDocument();
    expect(screen.getByText(/O que você registrar continua sendo guardado/)).toBeInTheDocument();
  });

  it('abaixo dos limites não avisa nada', async () => {
    comAnexos([item()], [anexo()]);
    await screen.findByRole('list', { name: 'Registros da viagem' });
    expect(screen.queryByText('Fila quase cheia')).toBeNull();
    expect(screen.queryByText('Espaço de fotos quase acabando')).toBeNull();
  });
});

describe('ações da tela (T044)', () => {
  const actions = (over: Record<string, unknown> = {}) => ({
    syncing: false, syncNow: vi.fn(async () => undefined), retry: vi.fn(async () => undefined), canDecide: true,
    discard: vi.fn(async () => ({ ok: true as const })), resubmit: vi.fn(async () => ({ ok: true as const })), ...over,
  });
  const conflictView = { conflictId: 'c1', itemId: 'q2', tripId: 'T1', reasonCode: 'TRIP_CLOSED', reasonText: 'A viagem foi encerrada depois que você registrou isto.', summary: { operation: 'trip.check_item', queuedAt: '2026-10-13T11:00:00Z' }, remote: {}, createdAt: '' };
  const withActions = (items: OutboxItem[], a = actions(), props: Record<string, unknown> = {}) => render(
    <SyncView online now={() => NOW} readStorage={async () => storage()} available actions={a}
      load={async () => ({ items, trips: [], conflicts: [conflictView] })} {...props} />,
  );

  it('"Enviar agora" chama o envio e fica desabilitado sem conexão, com o motivo', async () => {
    const a = actions();
    const { unmount } = withActions([item()], a);
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar agora' }));
    await waitFor(() => expect(a.syncNow).toHaveBeenCalled());
    unmount();
    withActions([item()], actions(), { online: false });
    expect(await screen.findByRole('button', { name: 'Enviar agora' })).toBeDisabled();
    expect(screen.getByText('Sem conexão. O envio recomeça quando houver conexão.')).toBeInTheDocument();
  });

  it('item que falhou ganha "Tentar de novo"', async () => {
    const a = actions();
    withActions([item({ status: 'failed', failure_reason: 'NETWORK' })], a);
    fireEvent.click(await screen.findByRole('button', { name: /Tentar de novo/ }));
    await waitFor(() => expect(a.retry).toHaveBeenCalledWith('q1'));
  });

  it('conflito ganha "Ver conflito", que abre o painel', async () => {
    withActions([item({ id: 'q2', status: 'conflict', failure_reason: 'TRIP_CLOSED' })]);
    fireEvent.click(await screen.findByRole('button', { name: /Ver conflito/ }));
    expect(await screen.findByRole('dialog', { name: 'Conflito na sincronização' })).toBeInTheDocument();
  });

  it('enviando: avisa em texto', async () => {
    withActions([item({ status: 'syncing' })], actions({ syncing: true }));
    await screen.findByRole('button', { name: /Enviando/ });
    expect(screen.getByText('Enviando os registros…')).toBeInTheDocument();
  });

  it('sem as ações, a tela só mostra a fila', async () => {
    view({ items: [item()] });
    await screen.findByRole('list', { name: 'Registros da viagem' });
    expect(screen.queryByRole('button', { name: 'Enviar agora' })).toBeNull();
  });
});
