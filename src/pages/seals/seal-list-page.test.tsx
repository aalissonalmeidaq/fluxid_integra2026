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

  // Spec 013 (RF-015): o lacre destinado pelo Master, ativo e sem cilindro, aparece como "Pronto para vincular", com a data da aprovação.
  it('pronto para vincular, com ícone, texto e a data da aprovação; o vazio explica que os lacres chegam pelo Master', async () => {
    const ready = { ...ITEM, cylinder: null, ready_to_bind: true, approved_at: '2026-10-17T13:00:00Z', origin: 'enrollment' };
    const { service: s } = service([{ code: 'LISTED', items: [ready], total: 1 }, { code: 'LISTED', items: [], total: 0 }]);
    renderList(s);
    expect(await screen.findByText('Pronto para vincular')).toBeInTheDocument();
    expect(screen.getByText('Aprovado em 17/10/2026 10:00')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Só prontos para vincular'));
    expect(await screen.findByText('Nenhum lacre encontrado')).toBeInTheDocument();
    expect(screen.getByText('Os lacres chegam pelo Master da plataforma. Peça a destinação de um lacre ao seu tenant.')).toBeInTheDocument();
  });

  it('filtros por saúde, trava e "sem cilindro" chamam o servidor', async () => {
    const { service: s, call } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    renderList(s);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Saúde'), { target: { value: 'no_comm' } });
    fireEvent.change(screen.getByLabelText('Trava'), { target: { value: 'unconfirmed' } });
    fireEvent.click(screen.getByLabelText('Só prontos para vincular'));
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

  it('não há mais cadastro de dispositivo (Spec 013, RF-018), nem para quem administra', async () => {
    const { service: s } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    renderList(s);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Cadastrar dispositivo' })).not.toBeInTheDocument();
  });

  it('a aprovação, a retirada ou a devolução (aviso "device") recarregam a lista sozinhas', async () => {
    const ready = { ...ITEM, device_id: 'd2', device_code: 'DSP-NOVO0001', label: 'Lacre novo', cylinder: null, ready_to_bind: true };
    const { service: s } = service([{ code: 'LISTED', items: [ITEM], total: 1 }, { code: 'LISTED', items: [ITEM, ready], total: 2 }]);
    const rt = realtime();
    renderList(s, { realtime: rt.port });
    await screen.findByText('Funcionando');
    act(() => rt.emit({ kind: 'device', deviceId: 'd2', cylinderId: null }));
    expect(await screen.findByText('Pronto para vincular')).toBeInTheDocument();
  });

  it('offline: explica e não chama o servidor', async () => {
    const { service: s, call } = service([{ code: 'LISTED', items: [ITEM], total: 1 }]);
    renderList(s, { online: false });
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });
});
