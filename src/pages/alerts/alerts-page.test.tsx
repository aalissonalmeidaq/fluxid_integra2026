import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import { AlertsListView } from './alerts-page';

// Spec 012 (T055; RF-035, RF-042, RF-043): a página de alertas passa a ser a lista REAL da organização (sem o selo "Exemplo"), com
// filtros por situação e severidade, severidade e tipo em ícone e texto, e estados de carregando, vazio, erro e offline.
const NOW = new Date('2026-10-17T14:10:00Z');
const ALERT = {
  id: 'a1600000-0000-4000-8000-0000000000a1', kind: 'possible_loss', severity: 'high', source: 'system', status: 'open',
  opened_at: '2026-10-17T14:05:00Z', recovered_at: null, acknowledged_at: null, closed_at: null,
  device: { id: 'd1', device_code: 'DSP-READA001', label: 'Lacre A' }, cylinder: { id: 'c1', serial_number: 'CIL-0042' }, trip_id: null, site_id: null,
};

function service(responses: unknown[]) {
  const call = vi.fn(async () => {
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    return { status: 200, body: next };
  });
  return { service: new SealService({ call } as SealTransport), call };
}
const renderList = (s: SealService | null, online = true) =>
  render(<AlertsListView service={s} organizationId="org-a" online={online} realtime={null} now={() => NOW} />);

describe('AlertsListView', () => {
  it('lista real: tipo, severidade, cilindro e idade, sem o selo "Exemplo"', async () => {
    const { service: s } = service([{ code: 'LISTED', items: [ALERT], total: 1 }]);
    renderList(s);
    const lista = await screen.findByRole('list', { name: 'Lista de alertas' });
    const item = within(lista).getByRole('listitem');
    expect(item).toHaveTextContent('Possível extravio');
    expect(item).toHaveTextContent('Alta');
    expect(item).toHaveTextContent('CIL-0042');
    expect(item).toHaveTextContent('há 5 minutos');
    expect(within(item).getByRole('link')).toHaveAttribute('href', `/alertas/${ALERT.id}`);
    expect(screen.queryByText('Exemplo')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Alertas' })).toBeInTheDocument();
  });

  it('filtros por situação e severidade chamam o servidor', async () => {
    const { service: s, call } = service([{ code: 'LISTED', items: [ALERT], total: 1 }]);
    renderList(s);
    await screen.findByRole('list', { name: 'Lista de alertas' });
    expect(call).toHaveBeenLastCalledWith('query-seals', expect.objectContaining({ operation: 'list_alerts', status: 'active' }));
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'closed' } });
    fireEvent.change(screen.getByLabelText('Severidade'), { target: { value: 'critical' } });
    await waitFor(() => expect(call).toHaveBeenLastCalledWith('query-seals', expect.objectContaining({ status: 'closed', severity: 'critical' })));
  });

  it('vazio', async () => {
    const { service: s } = service([{ code: 'LISTED', items: [], total: 0 }]);
    renderList(s);
    expect(await screen.findByText('Nenhum alerta nesta situação.')).toBeInTheDocument();
  });

  it('erro com "Tentar novamente"', async () => {
    const { service: s } = service([new Error('rede'), { code: 'LISTED', items: [ALERT], total: 1 }]);
    renderList(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('list', { name: 'Lista de alertas' })).toBeInTheDocument();
  });

  it('offline: explica sem chamar o servidor', async () => {
    const { service: s, call } = service([{ code: 'LISTED', items: [ALERT], total: 1 }]);
    renderList(s, false);
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });
});
