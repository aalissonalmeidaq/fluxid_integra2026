import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackingTransport } from '@/application/tracking/tracking-ports';
import { ProximityOccurrenceService } from '@/application/tracking/proximity-occurrence-service';
import { ProximityOccurrenceScreen } from './proximity-occurrence-page';

// Spec 015 (T065; US4, RF-015, RF-022, RF-040): detalhe da ocorrência com as evidências em texto; reconhecer e encerrar por teclado, com
// nota obrigatória no encerramento; sem permissão, só leitura; conflito de versão recarrega; nunca se presume mudança física (custódia
// ou trava) — a tela diz isso.
const OCC = 'f1560000-0000-4000-8000-0000000000a1';
const occurrence = (patch: Record<string, unknown> = {}) => ({
  code: 'FOUND',
  occurrence: { id: OCC, status: 'open', detection_kind: 'live', version: 1, opened_at: '2026-10-22T14:02:00Z', acknowledged_at: null, closed_at: null,
    close_note: null, trip_id: 't1', cylinder_id: 'c1', device_id: 'd1', alert_id: 'a1', trip_number: 9201, serial_number: 'OCC-A-1',
    device_label: 'Lacre O1', alert_status: 'open', acknowledged_by_name: null, closed_by_name: null, ...patch },
  evidences: [
    { id: 'e1', observed_at: '2026-10-22T14:00:00Z', result: 'outside', reason: 'beyond_limit', distance_m: 231.5, rule_version: 1, distance_threshold_m: 100, retrospective: false },
    { id: 'e2', observed_at: '2026-10-22T14:01:00Z', result: 'outside', reason: 'beyond_limit', distance_m: 240.2, rule_version: 1, distance_threshold_m: 100, retrospective: false },
    { id: 'e3', observed_at: '2026-10-22T14:02:00Z', result: 'outside', reason: 'beyond_limit', distance_m: 252.9, rule_version: 1, distance_threshold_m: 100, retrospective: false },
  ],
});

function backend(responses: { status: number; body: unknown }[]) {
  const call = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0]!));
  return { service: new ProximityOccurrenceService({ call } as TrackingTransport), call };
}
const renderScreen = (service: ProximityOccurrenceService, extra: Partial<React.ComponentProps<typeof ProximityOccurrenceScreen>> = {}) =>
  render(<ProximityOccurrenceScreen service={service} organizationId="org-a" occurrenceId={OCC} online canOperate {...extra} />);

describe('ocorrência de afastamento', () => {
  it('mostra o que aconteceu, as três evidências e que nada físico muda', async () => {
    renderScreen(backend([{ status: 200, body: occurrence() }]).service);
    expect(await screen.findByRole('heading', { name: 'Afastamento confirmado · OCC-A-1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Viagem 9201/ })).toHaveAttribute('href', '/rastreamento/viagens/t1');
    const evidences = screen.getByRole('list', { name: 'Comparações que confirmaram' });
    expect(within(evidences).getAllByRole('listitem')).toHaveLength(3);
    expect(evidences).toHaveTextContent('Fora do limite: 232 m (limite de 100 m)');
    expect(screen.getByText(/não muda a custódia do cilindro nem o estado da trava/)).toBeInTheDocument();
  });

  it('aberta: resumo com tempo, cilindro, lacre e próximo passo; Reconhecer é a ação principal', async () => {
    renderScreen(backend([{ status: 200, body: occurrence() }]).service, { now: () => new Date('2026-10-22T14:32:00Z') });
    const summary = await screen.findByRole('region', { name: 'Resumo da ocorrência' });
    expect(summary).toHaveTextContent('há 30 minutos');
    expect(summary).toHaveTextContent('OCC-A-1');
    expect(summary).toHaveTextContent('Lacre O1');
    expect(summary).toHaveTextContent('Confira a carga com o motorista e reconheça a ocorrência.');
    expect(screen.getByRole('button', { name: 'Reconhecer' }).className).toContain('bg-azul-profundo');
    expect(screen.getByRole('button', { name: 'Encerrar ocorrência' }).className).toContain('bg-branco');
  });

  it('a garantia sobre custódia e trava fica num aviso em destaque, não em legenda', async () => {
    renderScreen(backend([{ status: 200, body: occurrence() }]).service);
    const text = await screen.findByText(/não muda a custódia do cilindro nem o estado da trava/);
    expect(text.closest('[data-variant="informacao"]')).not.toBeNull();
  });

  it('reconhecida: Encerrar passa a ser a ação principal', async () => {
    renderScreen(backend([{ status: 200, body: occurrence({ status: 'acknowledged', version: 2 }) }]).service);
    expect((await screen.findByRole('button', { name: 'Encerrar ocorrência' })).className).toContain('bg-azul-profundo');
  });

  it('reconhecer por teclado registra o responsável e recarrega a versão nova', async () => {
    const { service, call } = backend([{ status: 200, body: occurrence() }, { status: 200, body: { code: 'ACKNOWLEDGED', version: 2 } },
      { status: 200, body: occurrence({ status: 'acknowledged', version: 2, acknowledged_at: '2026-10-22T14:05:00Z', acknowledged_by_name: 'Ana Gestora' }) }]);
    renderScreen(service);
    const button = await screen.findByRole('button', { name: 'Reconhecer' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-tracking', expect.objectContaining({ operation: 'acknowledge_proximity_occurrence', version: 1 })));
    expect(await screen.findByText(/Reconhecida por Ana Gestora/)).toBeInTheDocument();
    expect(screen.getByText('Ocorrência reconhecida.')).toBeInTheDocument();
    expect(screen.getByText('Ocorrência reconhecida.').closest('.sr-only')).toBeNull();
  });

  it('encerrar exige observação no diálogo e envia a versão atual', async () => {
    const { service, call } = backend([{ status: 200, body: occurrence({ status: 'acknowledged', version: 2 }) },
      { status: 200, body: { code: 'CLOSED', version: 3 } }, { status: 200, body: occurrence({ status: 'closed', version: 3, close_note: 'Carga conferida.', closed_at: '2026-10-22T14:10:00Z' }) }]);
    renderScreen(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar ocorrência' }));
    const dialog = screen.getByRole('dialog', { name: 'Encerrar ocorrência' });
    fireEvent.change(within(dialog).getByLabelText('Observação'), { target: { value: 'Carga conferida.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-tracking', expect.objectContaining({ operation: 'close_proximity_occurrence', version: 2, note: 'Carga conferida.' })));
    expect(await screen.findByText('Carga conferida.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('conflito de versão: avisa e recarrega a versão atual', async () => {
    const { service, call } = backend([{ status: 200, body: occurrence() }, { status: 409, body: { code: 'VERSION_CONFLICT' } },
      { status: 200, body: occurrence({ status: 'acknowledged', version: 2 }) }]);
    renderScreen(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Reconhecer' }));
    expect(await screen.findByText(/mudou enquanto você a via/)).toBeInTheDocument();
    await waitFor(() => expect(call).toHaveBeenCalledTimes(3));
  });

  it('sem a permissão de operar alertas: só leitura, com o motivo', async () => {
    renderScreen(backend([{ status: 200, body: occurrence() }]).service, { canOperate: false });
    await screen.findByRole('heading', { name: 'Afastamento confirmado · OCC-A-1' });
    expect(screen.queryByRole('button', { name: 'Reconhecer' })).toBeNull();
    expect(screen.getByText('Só quem opera alertas pode reconhecer ou encerrar esta ocorrência.')).toBeInTheDocument();
  });

  it('ocorrência só histórica não tem ações e explica por quê', async () => {
    renderScreen(backend([{ status: 200, body: occurrence({ status: 'historical_only', alert_id: null, detection_kind: 'retrospective' }) }]).service);
    expect(await screen.findByText(/a viagem já tinha terminado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconhecer' })).toBeNull();
  });

  it('sem conexão: ações desabilitadas com o motivo', async () => {
    const { service } = backend([{ status: 200, body: occurrence() }]);
    const view = renderScreen(service);
    await screen.findByRole('button', { name: 'Reconhecer' });
    view.rerender(<ProximityOccurrenceScreen service={service} organizationId="org-a" occurrenceId={OCC} online={false} canOperate />);
    expect(screen.getByRole('button', { name: 'Reconhecer' })).toBeDisabled();
    expect(screen.getByText('Sem conexão: reconhecer e encerrar exigem conexão.')).toBeInTheDocument();
  });

  it('inexistente ou de outra empresa: não encontrada', async () => {
    renderScreen(backend([{ status: 404, body: { code: 'NOT_FOUND' } }]).service);
    expect(await screen.findByText('Ocorrência não encontrada')).toBeInTheDocument();
  });
});
