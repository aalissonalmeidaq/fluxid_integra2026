import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RealtimePort, SealSignal } from '@/application/seals/seal-realtime';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import { SealListView } from './seal-list-page';

// Spec 012 (T056; História 6, cenário 7; RF-042): lista de lacres com saúde e trava em ícone e texto, filtros e atualização sozinha
// anunciada a leitores de tela sem mover o foco. A tabela vira cartões abaixo de 768 px (DataTable do design system).
const NOW = new Date('2026-10-17T14:10:00Z');
const ITEM = {
  device_id: 'a1400000-0000-4000-8000-0000000000a1', device_code: 'DSP-READA001', label: 'Lacre A', status: 'active', health: 'ok',
  lock_state: 'locked', seal_state: 'closed', battery_pct: 87, signal_dbm: -61, last_seen_at: '2026-10-17T14:09:00Z', report_interval_s: 60,
  position: null, pending_command: null, watch: null, violation: null, cylinder: { id: 'c1', serial_number: 'CIL-0042', custody_status: 'in_transit' },
};

function service(responses: unknown[]) {
  const call = vi.fn(async () => ({ status: 200, body: responses.length > 1 ? responses.shift() : responses[0] }));
  return { service: new SealService({ call } as SealTransport), call };
}
function realtime() {
  let emit: (s: SealSignal) => void = () => undefined;
  const port: RealtimePort = { subscribe: (_t, onSignal, onStatus) => { emit = onSignal; onStatus('connected'); return () => undefined; } };
  return { port, emit: (s: SealSignal) => emit(s) };
}
const renderList = (s: SealService, extra: Partial<React.ComponentProps<typeof SealListView>> = {}) =>
  render(<SealListView service={s} organizationId="org-a" online realtime={null} now={() => NOW} {...extra} />);

describe('SealListView', () => {
  it('tabela com lacre, cilindro, saúde, trava, bateria e último contato', async () => {
    const { service: s } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    renderList(s);
    const table = await screen.findByRole('table', { name: 'Lacres da organização' });
    const row = within(table).getAllByRole('row')[1] as HTMLElement;
    expect(within(row).getByRole('link', { name: /Lacre A/ })).toHaveAttribute('href', `/lacres/${ITEM.device_id}`);
    expect(within(row).getByRole('link', { name: 'CIL-0042' })).toHaveAttribute('href', '/cilindros/c1');
    expect(row).toHaveTextContent('Funcionando');
    expect(row).toHaveTextContent('Travada');
    expect(row).toHaveTextContent('87%');
    expect(row).toHaveTextContent('há 1 minuto');
  });

  it('lacre sem cilindro e vazio', async () => {
    const { service: s } = service([{ code: 'LISTED', items: [{ ...ITEM, cylinder: null }], total: 1 }, { code: 'LISTED', items: [], total: 0 }]);
    renderList(s);
    expect(await screen.findByText('Sem cilindro')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Só lacres sem cilindro'));
    expect(await screen.findByText('Nenhum lacre encontrado')).toBeInTheDocument();
  });

  it('filtros por saúde, trava e "sem cilindro" chamam o servidor', async () => {
    const { service: s, call } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    renderList(s);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Saúde'), { target: { value: 'no_comm' } });
    fireEvent.change(screen.getByLabelText('Trava'), { target: { value: 'unconfirmed' } });
    fireEvent.click(screen.getByLabelText('Só lacres sem cilindro'));
    await waitFor(() => expect(call).toHaveBeenLastCalledWith('query-seals', expect.objectContaining({ health: 'no_comm', lock_state: 'unconfirmed', unbound: true })));
  });

  it('mudança de saúde chega sozinha e é anunciada sem mover o foco', async () => {
    const { service: s } = service([{ code: 'LISTED', items: [ITEM], total: 1 }, { code: 'LISTED', items: [{ ...ITEM, health: 'no_comm' }], total: 1 }]);
    const rt = realtime();
    renderList(s, { realtime: rt.port });
    await screen.findByText('Funcionando');
    const before = document.activeElement;
    act(() => rt.emit({ kind: 'health', deviceId: ITEM.device_id, cylinderId: null }));
    expect(await screen.findByText('Sem comunicação')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Lista de lacres atualizada.');
    expect(document.activeElement).toBe(before);
  });

  it('cadastrar dispositivo (US5): a chave aparece uma vez e a lista recarrega', async () => {
    const { service: s, call } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    (call as unknown as { mockImplementation: (fn: (fn: string, body: Record<string, unknown>) => Promise<unknown>) => void }).mockImplementation(async (_fn: string, body: Record<string, unknown>) => ({ status: 200, body: body.operation === 'create_device'
      ? { code: 'CREATED', device_id: 'd9', device_code: 'DSP-NOVO0001', device_key: 'fxk_chave-nova' } : { code: 'LISTED', items: [ITEM], total: 1 } }));
    renderList(s, { canAdmin: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar dispositivo' }));
    fireEvent.change(await screen.findByLabelText('Nome do lacre'), { target: { value: 'Lacre novo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(await screen.findByText('fxk_chave-nova')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Já guardei a chave para gravar no lacre'));
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByText('fxk_chave-nova')).not.toBeInTheDocument());
  });

  it('quem não administra dispositivos não vê o cadastro', async () => {
    const { service: s } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    renderList(s);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Cadastrar dispositivo' })).not.toBeInTheDocument();
  });

  it('offline: explica e não chama o servidor', async () => {
    const { service: s, call } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    renderList(s, { online: false });
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });
});
