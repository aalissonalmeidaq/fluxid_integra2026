import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RealtimePort, SealSignal } from '@/application/seals/seal-realtime';
import { SealService, type SealTransport } from '@/application/seals/seal-service';
import { CylinderSealBlock } from './cylinder-seal-block';

// Spec 012 (T039; RF-011, RF-042, RF-043; História 1, cenários 6 e 7): bloco "Lacre" no detalhe do cilindro.
vi.mock('@/components/maps/osm-map', () => ({
  OsmMap: ({ title, latitude, longitude }: { title: string; latitude: number; longitude: number }) => <figure aria-label={title}>Ponto: {latitude}, {longitude}</figure>,
}));

const NOW = new Date('2026-10-17T14:04:00Z');
const SEAL = {
  device_id: 'd1', device_code: 'DSP-READA001', label: 'Lacre A', status: 'active', health: 'ok', lock_state: 'locked', seal_state: 'closed',
  battery_pct: 87, signal_dbm: -61, last_seen_at: '2026-10-17T14:03:00Z', report_interval_s: 60,
  position: { latitude: -7.209194, longitude: -39.306367, accuracy_m: 6, quality: 'gps', read_at: '2026-10-17T14:03:00Z', last_seen_at: '2026-10-17T14:03:00Z' },
  pending_command: null, watch: null, violation: null,
};
const POSITIONS = { code: 'LISTED', items: [
  { latitude: -7.209194, longitude: -39.306367, accuracy_m: 6, quality: 'gps', seal_state: 'closed', battery_pct: 87, read_at: '2026-10-17T14:03:00Z', last_seen_at: '2026-10-17T14:03:00Z', repeat_count: 4 },
  { latitude: -7.2, longitude: -39.3, accuracy_m: null, quality: 'last_known', seal_state: 'closed', battery_pct: 88, read_at: '2026-10-17T13:00:00Z', last_seen_at: '2026-10-17T13:10:00Z', repeat_count: 1 },
] };

function service(responses: Record<string, unknown[]>) {
  const call = vi.fn(async (_fn: string, body: Record<string, unknown>) => {
    const queue = responses[String(body.operation)] ?? [];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return { status: 200, body: next };
  });
  return { service: new SealService({ call } as SealTransport), call };
}

function realtime() {
  let emit: (s: SealSignal) => void = () => undefined;
  const port: RealtimePort = { subscribe: (_t, onSignal, onStatus) => { emit = onSignal; onStatus('connected'); return () => undefined; } };
  return { port, emit: (s: SealSignal) => emit(s) };
}

const renderBlock = (props: Partial<React.ComponentProps<typeof CylinderSealBlock>> & { service: SealService | null }) =>
  render(<CylinderSealBlock organizationId="org-a" cylinderId="cyl-1" serialNumber="CIL-0042" online realtime={null} now={() => NOW} {...props} />);

afterEach(() => { vi.useRealTimers(); });

// Quantas vezes o lacre foi recarregado (o mapa faz a própria consulta das geocercas, que não conta aqui).
const vistas = (call: { mock: { calls: unknown[][] } }) => call.mock.calls.filter((c) => (c[1] as { operation?: string }).operation === 'cylinder_seal_view').length;

describe('CylinderSealBlock', () => {
  it('carregando, depois saúde, trava, bateria, qualidade e idade da posição em texto e ícone', async () => {
    const { service: s } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: SEAL }] });
    renderBlock({ service: s });
    expect(screen.getByText('Carregando o lacre…')).toBeInTheDocument();
    expect(await screen.findByText('Funcionando')).toBeInTheDocument();
    expect(screen.getByText('Travada')).toBeInTheDocument();
    expect(screen.getByText('87%')).toBeInTheDocument();
    expect(screen.getByText(/com GPS/)).toBeInTheDocument();
    // Última posição e último contato, os dois há 1 minuto.
    expect(screen.getAllByText(/há 1 minuto/)).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Lacre' })).toBeInTheDocument();
    expect(screen.getByLabelText('Última posição do lacre')).toHaveTextContent('-7.209194, -39.306367');
  });

  it('cilindro sem lacre', async () => {
    const { service: s } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: null }] });
    renderBlock({ service: s });
    expect(await screen.findByText('Este cilindro não tem lacre vinculado.')).toBeInTheDocument();
  });

  it('cilindro sem lacre: vincular escolhendo um lacre ativo sem cilindro (US5)', async () => {
    const { service: s, call } = service({
      cylinder_seal_view: [{ code: 'FOUND', seal: null }, { code: 'FOUND', seal: SEAL }],
      list_unbound_active_seals: [{ code: 'LISTED', items: [SEAL] }], bind_seal: [{ code: 'BOUND' }],
    });
    renderBlock({ service: s, permissions: ['seal.read', 'seal.operate'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular lacre' }));
    fireEvent.click(await screen.findByLabelText(/Lacre A/));
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'bind_seal', device_id: 'd1', cylinder_id: 'cyl-1' })));
    expect(await screen.findByText('Funcionando')).toBeInTheDocument();
  });

  it('comando de trava pendente aparece como "travamento pendente" (RF-030)', async () => {
    const { service: s } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: { ...SEAL, lock_state: 'unlocked',
      pending_command: { id: 'c', kind: 'lock', status: 'pending', origin: 'trip_start', created_at: '2026-10-17T14:00:00Z' } } }] });
    renderBlock({ service: s });
    expect(await screen.findByText('Travamento pendente')).toBeInTheDocument();
    expect(screen.getByText(/Início da viagem/)).toBeInTheDocument();
  });

  it('posição sem GPS diz que é a última conhecida', async () => {
    const { service: s } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: { ...SEAL, health: 'no_gps', position: { ...SEAL.position, quality: 'last_known', accuracy_m: null } } }] });
    renderBlock({ service: s });
    expect(await screen.findByText('Sem GPS')).toBeInTheDocument();
    expect(screen.getByText(/última posição conhecida/)).toBeInTheDocument();
  });

  it('erro com "Tentar novamente"', async () => {
    const { service: s, call } = service({ cylinder_seal_view: [new Error('rede'), { code: 'FOUND', seal: SEAL }] });
    renderBlock({ service: s });
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Funcionando')).toBeInTheDocument();
    expect(vistas(call)).toBe(2);
  });

  it('offline sem dado: explica e não chama o servidor (RF-043)', async () => {
    const { service: s, call } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: SEAL }] });
    renderBlock({ service: s, online: false });
    expect(await screen.findByText(/Sem conexão/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it('aviso em tempo real recarrega e anuncia a mudança num único status, sem mover o foco', async () => {
    const moved = { ...SEAL, position: { ...SEAL.position, latitude: -7.21, read_at: '2026-10-17T14:04:00Z', last_seen_at: '2026-10-17T14:04:00Z' } };
    const { service: s, call } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: SEAL }, { code: 'FOUND', seal: moved }] });
    const rt = realtime();
    renderBlock({ service: s, realtime: rt.port });
    await screen.findByText('Funcionando');
    const before = document.activeElement;
    act(() => rt.emit({ kind: 'position', deviceId: 'd1', cylinderId: 'cyl-1' }));
    await waitFor(() => expect(vistas(call)).toBe(2));
    const status = screen.getByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Localização do lacre confirmada: agora.'));
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(document.activeElement).toBe(before);
  });

  it('coordenada repetida atualiza e anuncia o horário da última confirmação', async () => {
    const confirmed = { ...SEAL, last_seen_at: '2026-10-17T14:04:00Z', position: { ...SEAL.position, last_seen_at: '2026-10-17T14:04:00Z' } };
    const { service: s } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: SEAL }, { code: 'FOUND', seal: confirmed }] });
    const rt = realtime();
    renderBlock({ service: s, realtime: rt.port });
    await screen.findByText('Funcionando');

    act(() => rt.emit({ kind: 'position', deviceId: 'd1', cylinderId: 'cyl-1' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Localização do lacre confirmada: agora.'));
    expect(screen.getByText('Última posição').nextElementSibling).toHaveTextContent('agora');
  });

  it('aviso de outro cilindro não recarrega', async () => {
    const { service: s, call } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: SEAL }] });
    const rt = realtime();
    renderBlock({ service: s, realtime: rt.port });
    await screen.findByText('Funcionando');
    act(() => rt.emit({ kind: 'position', deviceId: 'outro', cylinderId: 'outro-cilindro' }));
    expect(vistas(call)).toBe(1);
  });

  it('travar pelo bloco: justificativa e pedido pendente até o lacre confirmar (US2)', async () => {
    const { service: s, call } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: { ...SEAL, lock_state: 'unlocked' } }], request_lock: [{ code: 'REQUESTED', command_id: 'x' }] });
    renderBlock({ service: s, permissions: ['seal.read', 'seal.operate'], });
    fireEvent.click(await screen.findByRole('button', { name: 'Travar' }));
    fireEvent.change(await screen.findByLabelText('Justificativa'), { target: { value: 'Cilindro parado no pátio.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para travar' }));
    await waitFor(() => expect(call).toHaveBeenCalledWith('manage-seals', expect.objectContaining({ operation: 'request_lock', cylinder_id: 'cyl-1', justification: 'Cilindro parado no pátio.' })));
    expect(await screen.findByText(/A trava muda quando o lacre confirmar/)).toBeInTheDocument();
  });

  it('sem permissão de operar, sem botões; offline, botões desabilitados com o motivo', async () => {
    const { service: s } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: SEAL }] });
    const { rerender } = renderBlock({ service: s });
    await screen.findByText('Funcionando');
    expect(screen.queryByRole('button', { name: 'Travar' })).not.toBeInTheDocument();
    rerender(<CylinderSealBlock organizationId="org-a" cylinderId="cyl-1" serialNumber="CIL-0042" online={false} realtime={null} now={() => NOW} service={s} permissions={['seal.operate']} />);
    expect(screen.getByRole('button', { name: 'Travar' })).toBeDisabled();
    expect(screen.getByText('Sem conexão: comandos de lacre exigem conexão.')).toBeInTheDocument();
  });

  it('as posições em texto são a alternativa ao mapa (RF-042)', async () => {
    const { service: s } = service({ cylinder_seal_view: [{ code: 'FOUND', seal: SEAL }], list_positions: [POSITIONS] });
    renderBlock({ service: s });
    await screen.findByText('Funcionando');
    fireEvent.click(screen.getByText('Ver as posições em texto'));
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('-7.209194, -39.306367');
    expect(items[1]).toHaveTextContent('última posição conhecida');
  });
});
