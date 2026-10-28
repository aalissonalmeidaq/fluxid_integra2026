import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from '@/application/tracking/tracking-ports';
import { TrackingHistoryService } from '@/application/tracking/tracking-history-service';
import type { HistoryQueryResult } from '@/domain/tracking/history-query';
import { TrackingHistoryScreen } from './tracking-history-page';

// Spec 015 (T056; US3, RF-004, RF-019 a RF-021, RF-039, RF-041, CS-011): histórico em lista permanente e mapa; filtros na URL;
// carregamento progressivo sem reordenar; lacuna explícita; sem mapa (sem conexão), a lista continua completa.
const ID = 'e1560000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-10-22T15:00:00Z');
const RULE = { id: null, version: 0, distance_m: 100, max_age_s: 120, max_accuracy_m: 50, valid_from: null };
const QUERY: HistoryQueryResult = { ok: true, query: { subject: 'trip', subjectId: ID, from: '2026-10-22T08:00:00.000Z', to: '2026-10-22T18:00:00.000Z' } };
const pos = (id: string, at: string) => ({ id, kind: 'position', origin: 'mobile', subject_id: ID, subject_label: 'Celular do motorista', latitude: -7.23,
  longitude: -39.31, accuracy_m: 12, observed_at: at, received_at: at, occurred_at: at, sync_kind: 'live' });
const PAGE1 = { code: 'LISTED', generated_at: '2026-10-22T15:00:00Z', rule: RULE, next_cursor: { at: '2026-10-22T14:30:00Z', id: 'c1' }, items: [
  { id: 'e1', kind: 'event', subject_id: ID, trip_id: ID, event_type: 'trip_started', occurred_at: '2026-10-22T13:00:00Z' },
  pos('m1', '2026-10-22T14:00:00Z'), pos('m2', '2026-10-22T14:30:00Z'),
  { id: 'c1', kind: 'comparison', subject_id: 'dev1', cylinder_id: 'cyl', result: 'outside', reason: 'beyond_limit', distance_m: 222.4,
    retrospective: false, rule_version: 1, occurred_at: '2026-10-22T14:30:00Z' },
] };
const PAGE2 = { code: 'LISTED', generated_at: '2026-10-22T15:00:00Z', rule: RULE, next_cursor: null, items: [
  { id: 'o1', kind: 'occurrence', subject_id: 'dev1', cylinder_id: 'cyl', trip_id: ID, status: 'open', detection_kind: 'live', alert_id: 'a1', occurred_at: '2026-10-22T14:32:00Z' },
  { id: 'p1', kind: 'presence', subject_id: 'cyl', cylinder_id: 'cyl', source: 'nfc', occurred_at: '2026-10-22T14:40:00Z' },
] };

function backend(pages: unknown[], status = 200) {
  const call = vi.fn(async () => ({ status, body: pages.length > 1 ? pages.shift() : pages[0] }));
  return { service: new TrackingHistoryService({ call } as TrackingTransport, () => true, { now: () => NOW }), call };
}
const renderHistory = (service: TrackingHistoryService, extra: Partial<React.ComponentProps<typeof TrackingHistoryScreen>> = {}) =>
  render(<TrackingHistoryScreen service={service} organizationId="org-a" online query={QUERY} onQueryChange={vi.fn()} {...extra} />);

describe('histórico do rastreamento', () => {
  it('sem viagem ou cilindro escolhido, orienta a abrir a partir deles', () => {
    renderHistory(backend([PAGE1]).service, { query: { ok: false, reason: 'missing_subject' } });
    expect(screen.getByText(/Abra o histórico a partir de uma viagem/)).toBeInTheDocument();
  });

  it('a lista cronológica descreve cada fato em texto, com a lacuna explícita', async () => {
    renderHistory(backend([PAGE1]).service);
    const list = await screen.findByRole('list', { name: 'Cronologia do período' });
    const items = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/Viagem iniciada/);
    expect(items[1]).toMatch(/Celular do motorista/);
    expect(items[2]).toMatch(/Sem posição do celular entre 22\/10\/2026 11:00 e 22\/10\/2026 11:30/);
    // Mesmo instante: o desempate é pelo id, como no servidor.
    expect(items[3]).toMatch(/Fora do limite: 222 m/);
    expect(items[4]).toMatch(/Celular do motorista/);
  });

  it('carregar mais acrescenta a próxima página na ordem, sem repetir, e anuncia a quantidade', async () => {
    const { service, call } = backend([PAGE1, PAGE2]);
    renderHistory(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call).toHaveBeenLastCalledWith('query-tracking', expect.objectContaining({ cursor_at: '2026-10-22T14:30:00Z', cursor_id: 'c1' }));
    const list = screen.getByRole('list', { name: 'Cronologia do período' });
    expect(await within(list).findByText(/Afastamento confirmado/)).toBeInTheDocument();
    expect(within(list).getByText(/Leitura presencial por NFC/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull();
    expect(screen.getByText('7 fatos carregados.')).toBeInTheDocument();
  });

  it('o afastamento leva à ocorrência, e a posição diz o frescor uma vez só (no selo)', async () => {
    const { service } = backend([{ ...PAGE1, next_cursor: null, items: [...PAGE1.items, ...PAGE2.items] }]);
    renderHistory(service);
    const list = await screen.findByRole('list', { name: 'Cronologia do período' });
    expect(within(list).getByRole('link', { name: /Afastamento confirmado/ })).toHaveAttribute('href', '/rastreamento/ocorrencias/o1');
    const position = within(list).getAllByRole('button', { name: /Celular do motorista/ })[0] as HTMLElement;
    expect(position.textContent?.match(/Atual|Atrasada|Sem posição|Inconclusiva/g) ?? []).toHaveLength(1);
  });

  it('mudar o período atualiza a URL pela consulta canônica', async () => {
    const onQueryChange = vi.fn();
    renderHistory(backend([PAGE1]).service, { onQueryChange });
    fireEvent.change(await screen.findByLabelText('Início'), { target: { value: '2026-10-22T06:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }));
    expect(onQueryChange).toHaveBeenCalledWith({ subject: 'trip', subjectId: ID, from: new Date('2026-10-22T06:00').toISOString(), to: '2026-10-22T18:00:00.000Z' });
  });

  it('período inválido: erro junto do campo, sem consultar', async () => {
    const onQueryChange = vi.fn();
    renderHistory(backend([PAGE1]).service, { onQueryChange });
    fireEvent.change(await screen.findByLabelText('Início'), { target: { value: '2026-10-23T06:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar período' }));
    expect(screen.getByText('O início deve ser antes do fim.')).toBeInTheDocument();
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it('sem conexão, o mapa dá lugar ao aviso e a lista já carregada continua completa', async () => {
    const { service } = backend([PAGE1]);
    const view = renderHistory(service);
    await screen.findByRole('list', { name: 'Cronologia do período' });
    view.rerender(<TrackingHistoryScreen service={service} organizationId="org-a" online={false} query={QUERY} onQueryChange={vi.fn()} />);
    expect(screen.getByRole('list', { name: 'Cronologia do período' })).toBeInTheDocument();
    expect(screen.getByText(/O mapa precisa de conexão/)).toBeInTheDocument();
  });

  it('registro de outra empresa ou inexistente: não encontrado, sem dados', async () => {
    renderHistory(backend([{ code: 'NOT_FOUND' }], 404).service);
    expect(await screen.findByText('Registro não encontrado')).toBeInTheDocument();
  });

  it('período sem nada: estado vazio claro', async () => {
    renderHistory(backend([{ ...PAGE1, items: [], next_cursor: null }]).service);
    expect(await screen.findByText('Nada registrado neste período')).toBeInTheDocument();
  });
});
