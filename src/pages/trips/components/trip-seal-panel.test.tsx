import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RealtimePort, SealSignal } from '@/application/seals/seal-realtime';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import { TripSealPanel } from './trip-seal-panel';

// Spec 012 (T071; RF-030, RF-042, RF-043; História 2): a trava física de cada cilindro da viagem, separada do bloqueio lógico, em ícone e
// texto ("travada", "travamento pendente", "não confirmada", "sem lacre"); atualiza sozinha e anuncia a mudança sem mover o foco.
const NOW = new Date('2026-10-17T14:10:00Z');
const SEAL = {
  device_id: 'd1', device_code: 'DSP-TRIPL001', label: 'Lacre 1', status: 'active', health: 'ok', lock_state: 'unlocked', seal_state: 'closed',
  battery_pct: 87, signal_dbm: -61, last_seen_at: '2026-10-17T14:09:00Z', report_interval_s: 60, position: null, watch: null, violation: null,
  pending_command: { id: 'c1', kind: 'lock', status: 'delivered', origin: 'trip_start', created_at: '2026-10-17T14:00:00Z' },
};
const items = (first: Record<string, unknown>) => ({ code: 'FOUND', items: [
  { item_id: 'i1', cylinder_id: 'c1', serial_number: 'TRIP-LOCK-1', seal_command_id: 'c1', seal: first },
  { item_id: 'i2', cylinder_id: 'c2', serial_number: 'TRIP-LOCK-2', seal_command_id: null, unlock_note: 'outside_geofence', seal: { ...SEAL, device_id: 'd2', lock_state: 'unconfirmed', pending_command: null } },
  { item_id: 'i4', cylinder_id: 'c4', serial_number: 'TRIP-LOCK-4', seal_command_id: null, seal: null },
] });

function service(responses: unknown[]) {
  const call = vi.fn(async () => ({ status: 200, body: responses.length > 1 ? responses.shift() : responses[0] }));
  return { service: new SealService({ call } as SealTransport), call };
}

describe('TripSealPanel', () => {
  it('uma linha por cilindro, com a trava física em ícone e texto', async () => {
    const { service: s } = service([items(SEAL)]);
    render(<TripSealPanel service={s} organizationId="org-a" tripId="t1" online realtime={null} now={() => NOW} />);
    const list = await screen.findByRole('list', { name: 'Trava física dos cilindros' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('TRIP-LOCK-1');
    expect(rows[0]).toHaveTextContent('Travamento pendente');
    expect(rows[0]).toHaveTextContent('Entregue ao lacre');
    expect(rows[1]).toHaveTextContent('Não confirmada');
    expect(rows[2]).toHaveTextContent('Sem lacre');
    // US3: o motivo de não ter destravado na entrega e o caminho para o destravamento excepcional.
    expect(rows[1]).toHaveTextContent('fora da geocerca da unidade');
    expect(within(rows[1] as HTMLElement).getByRole('link', { name: 'Destravar pelo cilindro (excepcional)' })).toHaveAttribute('href', '/cilindros/c2');
    expect(screen.getByRole('heading', { name: 'Trava física dos cilindros' })).toBeInTheDocument();
  });

  it('a confirmação chega sozinha e é anunciada', async () => {
    const { service: s } = service([items(SEAL), items({ ...SEAL, lock_state: 'locked', pending_command: null })]);
    let emit: (signal: SealSignal) => void = () => undefined;
    const realtime: RealtimePort = { subscribe: (_t, onSignal, onStatus) => { emit = onSignal; onStatus('connected'); return () => undefined; } };
    render(<TripSealPanel service={s} organizationId="org-a" tripId="t1" online realtime={realtime} now={() => NOW} />);
    await screen.findByText('Travamento pendente');
    act(() => emit({ kind: 'lock', deviceId: 'd1', cylinderId: 'c1' }));
    expect(await screen.findByText('Travada')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Trava física atualizada.');
  });

  it('offline: explica sem chamar o servidor', async () => {
    const { service: s, call } = service([items(SEAL)]);
    render(<TripSealPanel service={s} organizationId="org-a" tripId="t1" online={false} realtime={null} now={() => NOW} />);
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });
});
