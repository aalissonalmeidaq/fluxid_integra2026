import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from '@/application/tracking/tracking-ports';
import type { TrackingRealtimePort, TrackingSignal } from '@/application/tracking/tracking-realtime';
import { TripTrackingService } from '@/application/tracking/trip-tracking-service';
import { ActiveTripsScreen } from './active-trips-page';
import { TripTrackingScreen } from './trip-tracking-page';

// Spec 015 (T021; US1, RF-001 a RF-006, RF-039 a RF-041): acompanhamento em lista e mapa equivalentes, frescor em ícone e texto,
// degradação visível, estados completos (carregando, vazio, erro, offline com informação anterior, inexistente) e atualização que não
// rouba o foco nem a seleção.
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRIP = 'b1560000-0000-4000-8000-0000000000a1';
const DEVICE = 'b1580000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-10-22T15:00:00Z');
const at = (secondsAgo: number) => new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
const RULE = { id: null, version: 0, distance_m: 100, max_age_s: 120, max_accuracy_m: 50, valid_from: null };
const point = (id: string, secondsAgo: number, accuracy: number, extra: Record<string, unknown> = {}) => ({
  id, latitude: -7.23, longitude: -39.31, accuracy_m: accuracy, observed_at: at(secondsAgo), received_at: at(secondsAgo - 2), ...extra,
});
const ROW = {
  trip_id: TRIP, trip_number: 9161, status: 'in_progress', started_at: at(1800),
  vehicle: { id: 'v', plate: 'TRQ1A11' }, driver: { id: 'd', name: 'Motorista Um' },
  session: { id: 's', status: 'active', platform: 'web_visible', capability: 'foreground_only', capability_changed_at: at(900),
    notifications_denied: false, last_online_confirmed_at: at(30), started_at: at(1700) },
  mobile: point('m2', 30, 15),
  seals: [{ device_id: DEVICE, label: 'Lacre do C1', cylinder_id: 'c1', serial_number: 'TRK-A-1', item_status: 'in_transit',
    position: point('s2', 600, 9, { confirmed_at: at(600), quality: 'gps' }) }],
  open_occurrences: 0,
};
const DETAIL = {
  code: 'FOUND', generated_at: at(0), rule: RULE, trip: ROW,
  recent: { mobile: [point('m0', 1500, 15), point('m1', 1440, 15), point('m2', 30, 15)], seals: [{ device_id: DEVICE, positions: [point('s2', 600, 9)] }] },
};
const LIST = { code: 'LISTED', generated_at: at(0), rule: RULE, items: [ROW], next_cursor: null };

function backend(responses: unknown[], status = 200) {
  const call = vi.fn(async () => ({ status, body: responses.length > 1 ? responses.shift() : responses[0] }));
  return { service: new TripTrackingService({ call } as TrackingTransport, () => true, { now: () => NOW }), call };
}
function realtime() {
  let emit: (s: TrackingSignal) => void = () => undefined;
  const port: TrackingRealtimePort = { subscribe: (_t, onSignal, onStatus) => { emit = onSignal; onStatus('connected'); return () => undefined; } };
  return { port, emit: (s: TrackingSignal) => act(() => emit(s)) };
}

describe('TripTrackingScreen (acompanhamento de uma viagem)', () => {
  const renderTrip = (service: TripTrackingService, extra: Partial<React.ComponentProps<typeof TripTrackingScreen>> = {}) =>
    render(<TripTrackingScreen service={service} organizationId={ORG} tripId={TRIP} online realtime={null} now={() => NOW} {...extra} />);

  it('mostra carregando e depois a viagem com veículo e motorista', async () => {
    renderTrip(backend([DETAIL]).service);
    expect(screen.getByText('Carregando o acompanhamento…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Viagem 9161' })).toBeInTheDocument();
    expect(screen.getByText(/TRQ1A11/)).toBeInTheDocument();
    expect(screen.getByText(/Motorista Um/)).toBeInTheDocument();
  });

  it('cada origem aparece com frescor em ícone e texto, instante e precisão', async () => {
    renderTrip(backend([DETAIL]).service);
    const origins = await screen.findByRole('list', { name: 'Origens de posição' });
    const [mobile, seal] = within(origins).getAllByRole('listitem') as HTMLElement[];
    expect(mobile).toHaveTextContent('Celular do motorista');
    expect(mobile).toHaveTextContent('Atual');
    expect(mobile).toHaveTextContent('± 15 m');
    expect(seal).toHaveTextContent('Lacre do C1 · TRK-A-1');
    expect(seal).toHaveTextContent('Atrasada');
    expect(seal).toHaveTextContent('há 10 minutos');
  });

  it('a degradação do celular fica visível ao gestor, com motivo e início', async () => {
    renderTrip(backend([DETAIL]).service);
    const alert = (await screen.findByText('Acompanhamento degradado')).closest('[data-variant="alerta"]') as HTMLElement;
    expect(alert).toHaveTextContent('O celular só envia a posição com o aplicativo aberto');
    expect(alert).toHaveTextContent('desde 22/10/2026 11:45');
  });

  it('a lista é a alternativa completa ao mapa e marca a lacuna sem ligar os pontos', async () => {
    renderTrip(backend([DETAIL]).service);
    const timeline = await screen.findByRole('list', { name: 'Cronologia recente' });
    expect(within(timeline).getAllByRole('button', { name: /Celular do motorista/ })).toHaveLength(3);
    expect(within(timeline).getByText(/Sem posição do celular entre 22\/10\/2026 11:36 e 22\/10\/2026 11:59/)).toBeInTheDocument();
  });

  it('selecionar na lista mantém o foco no item e sobrevive à atualização em tempo real', async () => {
    const live = realtime();
    const { service, call } = backend([DETAIL]);
    renderTrip(service, { realtime: live.port });
    const timeline = await screen.findByRole('list', { name: 'Cronologia recente' });
    const item = within(timeline).getAllByRole('button', { name: /Celular do motorista/ })[0] as HTMLElement;
    item.focus();
    fireEvent.click(item);
    expect(item).toHaveAttribute('aria-pressed', 'true');
    live.emit({ kind: 'position', tripId: TRIP });
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Acompanhamento atualizado às/)).toBeInTheDocument();
    const again = within(screen.getByRole('list', { name: 'Cronologia recente' })).getAllByRole('button', { name: /Celular do motorista/ })[0] as HTMLElement;
    expect(again).toHaveAttribute('aria-pressed', 'true');
    expect(document.activeElement).toBe(again);
  });

  it('aviso de outra viagem não atualiza nem anuncia', async () => {
    const live = realtime();
    const { service, call } = backend([DETAIL]);
    renderTrip(service, { realtime: live.port });
    await screen.findByRole('heading', { name: 'Viagem 9161' });
    live.emit({ kind: 'position', tripId: 'outra' });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('abaixo de 768 px, a lista é a visão padrão e o mapa abre pela alternância', async () => {
    renderTrip(backend([DETAIL]).service);
    const toggle = await screen.findByRole('group', { name: 'Forma de ver' });
    expect(within(toggle).getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('group', { name: 'Mapa do trajeto recente' })).toBeNull();
    fireEvent.click(within(toggle).getByRole('button', { name: 'Mapa' }));
    expect(await screen.findByRole('group', { name: 'Mapa do trajeto recente' })).toBeInTheDocument();
  });

  it('sem conexão, mantém a informação anterior identificada com o horário', async () => {
    const { service } = backend([DETAIL]);
    const view = renderTrip(service);
    await screen.findByRole('heading', { name: 'Viagem 9161' });
    view.rerender(<TripTrackingScreen service={service} organizationId={ORG} tripId={TRIP} online={false} realtime={null} now={() => NOW} />);
    expect(screen.getByText(/Sem conexão: informação anterior, de 22\/10\/2026 12:00/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Viagem 9161' })).toBeInTheDocument();
  });

  it('ocorrência aberta aparece no topo, com o caminho para o histórico da viagem', async () => {
    renderTrip(backend([{ ...DETAIL, trip: { ...ROW, open_occurrences: 1 } }]).service);
    const alert = (await screen.findByText('Afastamento confirmado nesta viagem')).closest('[data-variant="erro"]') as HTMLElement;
    expect(alert).toHaveTextContent('1 ocorrência aberta');
    expect(within(alert).getByRole('link', { name: 'Ver no histórico da viagem' })).toHaveAttribute('href', expect.stringContaining('/rastreamento/historico?'));
  });

  it('sem ocorrência aberta, não há aviso de afastamento', async () => {
    renderTrip(backend([DETAIL]).service);
    await screen.findByRole('heading', { name: 'Viagem 9161' });
    expect(screen.queryByText('Afastamento confirmado nesta viagem')).toBeNull();
  });

  it('o mapa tem legenda em texto para celular e lacre', async () => {
    renderTrip(backend([DETAIL]).service);
    fireEvent.click(within(await screen.findByRole('group', { name: 'Forma de ver' })).getByRole('button', { name: 'Mapa' }));
    const legend = await screen.findByRole('list', { name: 'Legenda do mapa' });
    expect(legend).toHaveTextContent('Celular do motorista');
    expect(legend).toHaveTextContent('Lacre');
  });

  it('sem conexão e sem nada carregado, explica', () => {
    renderTrip(backend([DETAIL]).service, { online: false });
    expect(screen.getByText('Sem conexão: o acompanhamento aparece quando a conexão voltar.')).toBeInTheDocument();
  });

  it('viagem inexistente ou de outra empresa: não encontrada, sem nenhum dado', async () => {
    renderTrip(backend([{ code: 'NOT_FOUND' }], 404).service);
    expect(await screen.findByText('Viagem não encontrada')).toBeInTheDocument();
    expect(screen.queryByText(/Celular do motorista/)).toBeNull();
  });

  it('falha do servidor oferece tentar de novo', async () => {
    const { service, call } = backend([{ code: 'X' }, DETAIL], 500);
    renderTrip(service);
    fireEvent.click(await screen.findByRole('button', { name: /Tentar novamente/ }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
  });
});

describe('ActiveTripsScreen (viagens em andamento)', () => {
  const renderList = (service: TripTrackingService, extra: Partial<React.ComponentProps<typeof ActiveTripsScreen>> = {}) =>
    render(<ActiveTripsScreen service={service} organizationId={ORG} online realtime={null} now={() => NOW} {...extra} />);

  it('lista as viagens com link, origens em ícone e texto e a degradação', async () => {
    renderList(backend([LIST]).service);
    const table = await screen.findByRole('table', { name: 'Viagens em andamento' });
    const row = within(table).getAllByRole('row')[1] as HTMLElement;
    expect(within(row).getByRole('link', { name: /Viagem 9161/ })).toHaveAttribute('href', `/rastreamento/viagens/${TRIP}`);
    expect(row).toHaveTextContent('Celular do motorista: Atual');
    expect(row).toHaveTextContent('Lacre do C1 · TRK-A-1: Atrasada');
    expect(row).toHaveTextContent('Degradado');
  });

  it('os contadores vêm da mesma coleção da lista', async () => {
    renderList(backend([LIST]).service);
    const counters = await screen.findByRole('list', { name: 'Resumo do acompanhamento' });
    expect(counters).toHaveTextContent('1 viagem em andamento');
    expect(counters).toHaveTextContent('1 origem atual');
    expect(counters).toHaveTextContent('1 origem atrasada');
    expect(counters).toHaveTextContent('1 viagem com acompanhamento degradado');
  });

  it('contador com valor filtra a lista e "Mostrar todas" desfaz o filtro', async () => {
    const OTHER = { ...ROW, trip_id: 'b1560000-0000-4000-8000-0000000000a2', trip_number: 9162, session: { ...ROW.session, capability: 'background' },
      seals: [{ ...ROW.seals[0]!, position: point('s3', 30, 9, { confirmed_at: at(30), quality: 'gps' }) }] };
    renderList(backend([{ ...LIST, items: [ROW, OTHER] }]).service);
    const counters = await screen.findByRole('list', { name: 'Resumo do acompanhamento' });
    const delayed = within(counters).getByRole('button', { name: /origem atrasada/ });
    fireEvent.click(delayed);
    expect(delayed).toHaveAttribute('aria-pressed', 'true');
    const table = screen.getByRole('table', { name: 'Viagens em andamento' });
    expect(within(table).getByRole('link', { name: /Viagem 9161/ })).toBeInTheDocument();
    expect(within(table).queryByRole('link', { name: /Viagem 9162/ })).toBeNull();
    expect(screen.getByText(/Mostrando 1 de 2 viagens/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar todas' }));
    expect(within(table).getByRole('link', { name: /Viagem 9162/ })).toBeInTheDocument();
    expect(delayed).toHaveAttribute('aria-pressed', 'false');
  });

  it('contadores zerados ficam numa linha discreta, sem filtrar', async () => {
    renderList(backend([LIST]).service);
    const counters = await screen.findByRole('list', { name: 'Resumo do acompanhamento' });
    expect(counters).toHaveTextContent('0 origens sem posição');
    expect(within(counters).queryByRole('button', { name: /origens sem posição/ })).toBeNull();
  });

  it('sem viagens em andamento: estado vazio claro', async () => {
    renderList(backend([{ ...LIST, items: [] }]).service);
    expect(await screen.findByText('Nenhuma viagem em andamento')).toBeInTheDocument();
  });

  it('aviso em tempo real atualiza e anuncia num único status', async () => {
    const live = realtime();
    const { service, call } = backend([LIST]);
    renderList(service, { realtime: live.port });
    await screen.findByRole('table', { name: 'Viagens em andamento' });
    live.emit({ kind: 'position', tripId: TRIP });
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Lista atualizada às/)).toBeInTheDocument();
  });

  it('sem conexão e sem nada carregado, explica', () => {
    renderList(backend([LIST]).service, { online: false });
    expect(screen.getByText('Sem conexão: as viagens em andamento aparecem quando a conexão voltar.')).toBeInTheDocument();
  });
});
